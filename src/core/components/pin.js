'use strict'

const dagPB = require('ipld-dag-pb')
const DAGNode = dagPB.DAGNode
const DAGLink = dagPB.DAGLink
const CID = require('cids')
const pinSet = require('./pin-set')
const promisify = require('promisify-es6')
const multihashes = require('multihashes')
const Key = require('interface-datastore').Key
const _ = require('lodash')
const each = require('async/each')
const waterfall = require('async/waterfall')
const until = require('async/until')

const keyString = multihashes.toB58String
function KeySet (keys) {
  // Buffers with identical data are still different objects, so
  // they need to be cast to strings to prevent duplicates in Sets
  this.keys = {}
  this.add = (key) => {
    this.keys[keyString(key)] = key
  }
  this.delete = (key) => {
    delete this.keys[keyString(key)]
  }
  this.clear = () => {
    this.keys = {}
  }
  this.has = (key) => {
    return (keyString(key) in this.keys)
  }
  this.toArray = () => {
    return Object.keys(this.keys).map((hash) => {
      return this.keys[hash]
    })
  }
  this.toStringArray = () => {
    return Object.keys(this.keys)
  }
  keys = keys || []
  keys.forEach(this.add)
}

module.exports = function pin (self) {
  let directPins = new KeySet()
  let recursivePins = new KeySet()
  let internalPins = new KeySet()

  // temp - should use /local/pins to be consistent with go repo, but
  // the pin set in datastore in test/go-ipfs-repo doesn't deserialize
  const pinDataStoreKey = new Key('/local/pins/js')

  const repo = self._repo
  const dag = self.dag

  function normalizeHashes (hashes, callback) {
    // try to accept a variety of hash options including
    // multihash Buffers, base58 strings, and ipfs path
    // strings, either individually or as an array
    if (Buffer.isBuffer(hashes) || typeof hashes.forEach !== 'function') {
      hashes = [hashes]
    }
    const normalized = {
      hashes: [],
      update: (multihash, cb) => {
        try {
          multihashes.validate(multihash)
        } catch (err) { return cb(err) }

        normalized.hashes.push(multihash)
        cb()
      }
    }
    each(hashes, (hash, cb) => {
      if (typeof hash === 'string') {
        // example: '/ipfs/QmRootHash/links/by/name'
        const matched = hash.match(/^(?:\/ipfs\/)?([^/]+(?:\/[^/]+)*)\/?$/)
        if (!matched) {
          return cb(new Error('invalid ipfs ref path'))
        }
        const split = matched[1].split('/')
        const rootHash = multihashes.fromB58String(split[0])
        const links = split.slice(1, split.length)
        if (!links.length) {
          normalized.update(rootHash, cb)
        } else {
          // recursively follow named links to the target
          const pathFn = (err, obj) => {
            if (err) { return cb(err) }
            if (links.length) {
              const linkName = links.shift()
              const nextLink = obj.links.filter((link) => {
                return (link.name === linkName)
              })
              if (!nextLink.length) {
                return cb(new Error(
                  `no link named ${linkName} under ${obj.toJSON().Hash}`
                ))
              }
              const nextHash = nextLink[0].multihash
              self.object.get(nextHash, pathFn)
            } else {
              normalized.update(obj.multihash, cb)
            }
          }
          self.object.get(rootHash, pathFn)
        }
      } else {
        normalized.update(hash, cb)
      }
    }, (err) => {
      if (err) { return callback(err) }
      return callback(null, normalized.hashes)
    })
  }

  function getRecursive (multihash, callback) {
    // gets flat array of all DAGNodes in tree given by multihash
    // (should this be part of dag.js API? it was in ipfs-merkle-dag)
    dag.get(new CID(multihash), (err, res) => {
      if (err) { return callback(err) }
      const links = res.value.links
      const nodes = [res.value]
      // leaf case
      if (!links.length) {
        return callback(null, nodes)
      }
      // branch case
      links.forEach(link => {
        getRecursive(link.multihash, (err, subNodes) => {
          if (err) { return callback(err) }
          nodes.push(subNodes)
          if (nodes.length === links.length + 1) {
            return callback(null, _.flattenDeep(nodes))
          }
        })
      })
    })
  }

  const pin = {
    types: {
      direct: 'direct',
      recursive: 'recursive',
      indirect: 'indirect',
      internal: 'internal',
      all: 'all'
    },

    clear: () => {
      directPins.clear()
      recursivePins.clear()
      internalPins.clear()
    },

    set: pinSet(dag),

    add: promisify((hashes, options, callback) => {
      // callback (err, pinset)
      if (typeof options === 'function') {
        callback = options
        options = null
      }
      const recursive = !options || options.recursive !== false
      normalizeHashes(hashes, (err, mhs) => {
        if (err) { return callback(err) }
        const result = {
          // async result queue
          payload: [],
          update: (hash) => {
            result.payload.push({hash})
            if (result.payload.length === mhs.length) {
              pin.flush((err, root) => {
                if (err) { return callback(err) }
                return callback(null, result.payload)
              })
            }
          }
        }
        mhs.forEach((multihash) => {
          if (recursive) {
            if (recursivePins.has(multihash)) {
              // it's already pinned recursively
              result.update(keyString(multihash))
              return
            }

            // recursive pin should replace direct pin
            directPins.delete(multihash)

            // entire graph of nested links should be
            // pinned, so make sure we have all the objects
            getRecursive(multihash, (err) => {
              if (err) { return callback(err) }
              // found all objects, we can add the pin
              recursivePins.add(multihash)
              result.update(keyString(multihash))
            })
          } else {
            if (recursivePins.has(multihash)) {
              // recursive supersedes direct, can't have both
              return callback(
                `${keyString(multihash)} already pinned recursively`
              )
            }
            if (directPins.has(multihash)) {
              // already directly pinned
              result.update(keyString(multihash))
              return
            }
            // make sure we have the object
            dag.get(new CID(multihash), (err, res) => {
              if (err) { return callback(err) }
              // found the object, we can add the pin
              directPins.add(multihash)
              result.update(keyString(multihash))
            })
          }
        })
      })
    }),

    rm: promisify((hashes, options, callback) => {
      // callback (err)
      let recursive = true
      if (typeof options === 'function') {
        callback = options
      } else if (options && options.recursive === false) {
        recursive = false
      }
      normalizeHashes(hashes, (err, mhs) => {
        if (err) { return callback(err) }
        const result = {
          // async result queue
          payload: [],
          update: (hash) => {
            result.payload.push({hash})
            if (result.payload.length === mhs.length) {
              pin.flush((err, root) => {
                if (err) { return callback(err) }
                return callback(null, result.payload)
              })
            }
          }
        }
        mhs.forEach((multihash) => {
          pin.isPinnedWithType(multihash, pin.types.all, (err, pinned, reason) => {
            if (err) { return callback(err) }
            if (!pinned) { return callback(new Error('not pinned')) }
            switch (reason) {
              case (pin.types.recursive):
                if (recursive) {
                  recursivePins.delete(multihash)
                  return result.update(keyString(multihash))
                }
                return callback(new Error(
                  `${keyString(multihash)} is pinned recursively`
                ))
              case (pin.types.direct):
                directPins.delete(multihash)
                return result.update(keyString(multihash))
              default:
                return callback(new Error(
                  `${keyString(multihash)} is pinned indirectly under ${reason}`
                ))
            }
          })
        })
      })
    }),

    ls: promisify((hashes, options, callback) => {
      // callback (err, pinset)
      let type = pin.types.all
      if (typeof hashes === 'function') {
        callback = hashes
        options = null
        hashes = null
      }
      if (typeof options === 'function') {
        callback = options
      }
      if (hashes && hashes.type) {
        options = hashes
        hashes = null
      }
      if (options && options.type) {
        type = options.type.toLowerCase()
      }
      if (Object.keys(pin.types).indexOf(type) < 0) {
        return callback(new Error(
          `Invalid type '${type}', must be one of {direct, indirect, recursive, all}`
        ))
      }
      if (hashes) {
        normalizeHashes(hashes, (err, mhs) => {
          if (err) { return callback(err) }
          const result = {
            // async result queue
            payload: [],
            update: (item) => {
              result.payload.push(item)
              if (result.payload.length === mhs.length) {
                return callback(null, result.payload)
              }
            }
          }
          mhs.forEach((multihash) => {
            pin.isPinnedWithType(multihash, type, (err, pinned, reason) => {
              if (err) { return callback(err) }
              if (!pinned) {
                return callback(new Error(
                  `Path ${keyString(multihash)} is not pinned`
                ))
              }
              switch (reason) {
                case pin.types.direct:
                case pin.types.recursive:
                  result.update({
                    hash: keyString(multihash),
                    type: reason
                  })
                  break
                default:
                  result.update({
                    hash: keyString(multihash),
                    type: `${pin.types.indirect} through ${reason}`
                  })
              }
            })
          })
        })
      } else {
        const result = []
        if (type === pin.types.direct || type === pin.types.all) {
          pin.directKeyStrings().forEach((hash) => {
            result.push({
              type: pin.types.direct,
              hash: hash
            })
          })
        }
        if (type === pin.types.recursive || type === pin.types.all) {
          pin.recursiveKeyStrings().forEach((hash) => {
            result.push({
              type: pin.types.recursive,
              hash: hash
            })
          })
        }
        if (type === pin.types.indirect || type === pin.types.all) {
          pin.getIndirectKeys((err, hashes) => {
            if (err) { return callback(err) }
            hashes.forEach((hash) => {
              result.push({
                type: pin.types.indirect,
                hash: hash
              })
            })
            return callback(null, result)
          })
        } else {
          return callback(null, result)
        }
      }
    }),

    isPinned: (multihash, callback) => {
      // callback (err, pinned, reason)
      pin.isPinnedWithType(multihash, pin.types.all, callback)
    },

    isPinnedWithType: (multihash, pinType, callback) => {
      // callback (err, pinned, reason)

      // recursive
      if ((pinType === pin.types.recursive || pinType === pin.types.all) &&
          recursivePins.has(multihash)) {
        return callback(null, true, pin.types.recursive)
      }
      if ((pinType === pin.types.recursive)) {
        return callback(null, false)
      }
      // direct
      if ((pinType === pin.types.direct || pinType === pin.types.all) &&
          directPins.has(multihash)) {
        return callback(null, true, pin.types.direct)
      }
      if ((pinType === pin.types.direct)) {
        return callback(null, false)
      }
      if ((pinType === pin.types.internal || pinType === pin.types.all) &&
          internalPins.has(multihash)) {
        return callback(null, true, pin.types.internal)
      }
      if ((pinType === pin.types.internal)) {
        return callback(null, false)
      }

      // indirect (default)
      // check each recursive key to see if multihash is under it
      const rKeys = pin.recursiveKeys()
      let found = false
      until(
        // search until multihash was found or no more keys to check
        () => (found || !rKeys.length),
        (cb) => {
          const key = rKeys.pop()
          dag.get(new CID(key), (err, res) => {
            if (err) { return cb(err) }
            pin.set.hasChild(res.value, multihash, (err, has) => {
              if (err) { return cb(err) }
              found = has
              // if found, return the hash of the parent recursive pin
              cb(null, found ? keyString(res.value.multihash) : null)
            })
          })
        },
        (err, result) => {
          if (err) { return callback(err) }
          return callback(null, found, result)
        }
      )
    },

    directKeys: () => {
      return directPins.toArray()
    },

    directKeyStrings: () => {
      return directPins.toStringArray()
    },

    recursiveKeys: () => {
      return recursivePins.toArray()
    },

    recursiveKeyStrings: () => {
      return recursivePins.toStringArray()
    },

    getIndirectKeys: (callback) => {
      // callback (err, keys)
      const indirectKeys = new KeySet()
      const rKeys = pin.recursiveKeys()
      if (!rKeys.length) {
        return callback(null, [])
      }
      each(rKeys, (multihash, cb) => {
        getRecursive(multihash, (err, nodes) => {
          if (err) { return cb(err) }
          nodes.forEach((node) => {
            const mh = node.multihash
            if (!directPins.has(mh) && !recursivePins.has(mh)) {
              // not already pinned recursively or directly
              indirectKeys.add(mh)
            }
          })
          cb()
        })
      }, (err) => {
        if (err) { return callback(err) }
        callback(null, indirectKeys.toStringArray())
      })
    },

    internalKeys: () => {
      return internalPins.toArray()
    },

    internalKeyStrings: () => {
      return internalPins.toStringArray()
    },

    // encodes and writes pin key sets to the datastore
    // each key set will be stored as a DAG node, and a root node will link to both
    flush: promisify((callback) => {
      // callback (err, root)
      const newInternalPins = new KeySet()
      const logInternalKey = (mh) => newInternalPins.add(mh)
      const handle = {
        put: (k, v, cb) => {
          handle[k] = v
          cb()
        }
      }
      waterfall([
        // create link to direct keys node
        (cb) => pin.set.storeSet(pin.directKeys(), logInternalKey, cb),
        (dRoot, cb) => DAGLink.create(pin.types.direct, dRoot.size, dRoot.multihash, cb),
        (dLink, cb) => handle.put('dLink', dLink, cb),
        // create link to recursive keys node
        (cb) => pin.set.storeSet(pin.recursiveKeys(), logInternalKey, cb),
        (rRoot, cb) => DAGLink.create(pin.types.recursive, rRoot.size, rRoot.multihash, cb),
        (rLink, cb) => handle.put('rLink', rLink, cb),
        // the pin-set nodes link to an empty node, so make sure it's added to dag
        (cb) => DAGNode.create(new Buffer(0), cb),
        (empty, cb) => dag.put(empty, {cid: new CID(empty.multihash)}, cb),
        // create root node with links to direct and recursive nodes
        (cid, cb) => DAGNode.create(new Buffer(0), [handle.dLink, handle.rLink], cb),
        (root, cb) => handle.put('root', root, cb),
        // add the root node to dag
        (cb) => dag.put(handle.root, {cid: new CID(handle.root.multihash)}, cb),
        // update the internal pin set
        (cid, cb) => cb(null, logInternalKey(handle.root.multihash)),
        // save serialized root to datastore under a consistent key
        (_, cb) => repo.closed ? repo.datastore.open(cb) : cb(null, null),  // temp
        (_, cb) => repo.datastore.put(pinDataStoreKey, handle.root.serialized, cb)
      ], (err, result) => {
        if (err) { return callback(err) }
        internalPins = newInternalPins
        return callback(null, handle.root)
      })
    }),

    load: promisify((callback) => {
      // callback (err)
      const newInternalPins = new KeySet()
      const logInternalKey = (mh) => newInternalPins.add(mh)
      const handle = {
        put: (k, v, cb) => {
          handle[k] = v
          cb()
        }
      }
      waterfall([
        (cb) => repo.closed ? repo.datastore.open(cb) : cb(null, null),  // temp
        (_, cb) => repo.datastore.has(pinDataStoreKey, cb),
        (has, cb) => has ? cb() : cb('break'),
        (cb) => repo.datastore.get(pinDataStoreKey, cb),
        (serialized, cb) => dagPB.util.deserialize(serialized, cb),
        (root, cb) => handle.put('root', root, cb),
        (cb) => pin.set.loadSet(handle.root, pin.types.recursive, logInternalKey, cb),
        (rKeys, cb) => handle.put('rKeys', rKeys, cb),
        (cb) => pin.set.loadSet(handle.root, pin.types.direct, logInternalKey, cb)
      ], (err, dKeys) => {
        if (err && err !== 'break') { return callback(err) }
        if (dKeys) {
          directPins = new KeySet(dKeys)
          recursivePins = new KeySet(handle.rKeys)
          logInternalKey(handle.root.multihash)
          internalPins = newInternalPins
        }
        return callback()
      })
    })
  }
  return pin
}
