'use strict'

const multihashes = require('multihashes')
const CID = require('cids')
const protobuf = require('protocol-buffers')
const crypto = require('crypto')
const fnv1a = require('fnv1a')
const dagPB = require('ipld-dag-pb')
const DAGNode = dagPB.DAGNode
const DAGLink = dagPB.DAGLink
const varint = require('varint')
const once = require('once')

const emptyKeyHash = 'QmdfTbBqBPQ7VNxZEYEj14VmRuZBkqFbiwReogJgS1zR1n'
const emptyKey = multihashes.fromB58String(emptyKeyHash)
const defaultFanout = 256
const maxItems = 8192

// Protobuf interface
const pbSchema = (
  // from go-ipfs/pin/internal/pb/header.proto
  'message Set { ' +
    // 1 for now
    'optional uint32 version = 1; ' +
    // how many of the links are subtrees
    'optional uint32 fanout = 2; ' +
    // hash seed for subtree selection, a random number
    'optional fixed32 seed = 3; ' +
  '}'
)
const pb = protobuf(pbSchema)
function readHeader (rootNode) {
  // rootNode.data should be a buffer of the format:
  // < varint(headerLength) | header | itemData... >
  const rootData = rootNode.data
  const hdrLength = varint.decode(rootData)
  const vBytes = varint.decode.bytes
  if (vBytes <= 0) {
    return { err: 'Invalid Set header length' }
  }
  if (vBytes + hdrLength > rootData.length) {
    return { err: 'Impossibly large set header length' }
  }
  const hdrSlice = rootData.slice(vBytes, hdrLength + vBytes)
  const header = pb.Set.decode(hdrSlice)
  if (header.version !== 1) {
    return { err: 'Unsupported Set version: ' + header.version }
  }
  if (header.fanout > rootNode.links.length) {
    return { err: 'Impossibly large fanout' }
  }
  return {
    header: header,
    data: rootData.slice(hdrLength + vBytes)
  }
}

exports = module.exports = function (dag) {
  const pinSet = {
    // should this be part of `object` API?
    hasChild: (root, childhash, callback, _links, _checked, _seen) => {
      // callback (err, has)
      callback = once(callback)
      if (callback.called) { return }
      if (typeof childhash === 'object') {
        childhash = multihashes.toB58String(childhash)
      }
      _links = _links || root.links.length
      _checked = _checked || 0
      _seen = _seen || {}

      if (!root.links.length && _links === _checked) {
        // all nodes have been checked
        return callback(null, false)
      }
      root.links.forEach((link) => {
        const bs58link = multihashes.toB58String(link.multihash)
        if (bs58link === childhash) {
          return callback(null, true)
        }
        dag.get(new CID(link.multihash), (err, res) => {
          if (err) {
            return callback(err)
          }
          // don't check the same links twice
          if (bs58link in _seen) { return }
          _seen[bs58link] = true

          _checked++
          _links += res.value.links.length
          pinSet.hasChild(res.value, childhash, callback, _links, _checked, _seen)
        })
      })
    },

    storeSet: (keys, logInternalKey, callback) => {
      // callback (err, rootNode)
      const items = keys.map((key) => {
        return {
          key: key,
          data: null
        }
      })
      pinSet.storeItems(items, logInternalKey, (err, rootNode) => {
        if (err) { return callback(err) }
        const opts = { cid: new CID(rootNode.multihash) }
        dag.put(rootNode, opts, (err, cid) => {
          if (err) { return callback(err) }
          logInternalKey(rootNode.multihash)
          callback(null, rootNode)
        })
      })
    },

    storeItems: (items, logInternalKey, callback, _subcalls, _done) => {
      // callback (err, rootNode)
      callback = once(callback)
      const seed = crypto.randomBytes(4).readUInt32LE(0, true)
      const pbHeader = pb.Set.encode({
        version: 1,
        fanout: defaultFanout,
        seed: seed
      })
      let rootData = Buffer.concat([
        new Buffer(varint.encode(pbHeader.length)), pbHeader
      ])
      let rootLinks = []
      for (let i = 0; i < defaultFanout; i++) {
        rootLinks.push(new DAGLink('', 1, emptyKey))
      }
      logInternalKey(emptyKey)

      if (items.length <= maxItems) {
        // the items will fit in a single root node
        const itemLinks = []
        const itemData = []
        const indices = []
        for (let i = 0; i < items.length; i++) {
          itemLinks.push(new DAGLink('', 1, items[i].key))
          itemData.push(items[i].data || new Buffer(0))
          indices.push(i)
        }
        indices.sort((a, b) => {
          const x = Buffer.compare(itemLinks[a].multihash, itemLinks[b].multihash)
          if (x) { return x }
          return (a < b ? -1 : 1)
        })
        const sortedLinks = indices.map((i) => { return itemLinks[i] })
        const sortedData = indices.map((i) => { return itemData[i] })
        rootLinks = rootLinks.concat(sortedLinks)
        rootData = Buffer.concat([rootData].concat(sortedData))
        DAGNode.create(rootData, rootLinks, (err, rootNode) => {
          if (err) { return callback(err) }
          return callback(null, rootNode)
        })
      } else {
        // need to split up the items into multiple root nodes
        // (using go-ipfs "wasteful but simple" approach for consistency)
        _subcalls = _subcalls || 0
        _done = _done || 0
        const hashed = {}
        const hashFn = (seed, key) => {
          const buf = new Buffer(4)
          buf.writeUInt32LE(seed, 0)
          const data = Buffer.concat([
            buf, new Buffer(multihashes.toB58String(key))
          ])
          return fnv1a(data.toString('binary'))
        }
        // items will be distributed among `defaultFanout` bins
        for (let i = 0; i < items.length; i++) {
          let h = hashFn(seed, items[i].key) % defaultFanout
          hashed[h] = hashed[h] || []
          hashed[h].push(items[i])
        }
        const storeItemsCb = (err, child) => {
          if (callback.called) { return }
          if (err) {
            return callback(err)
          }
          dag.put(child, (err) => {
            if (callback.called) { return }
            if (err) {
              return callback(err)
            }
            logInternalKey(child.multihash)
            rootLinks[this.h] = new DAGLink(
              '', child.size, child.multihash
            )
            _done++
            if (_done === _subcalls) {
              // all finished
              DAGNode.create(rootData, rootLinks, (err, rootNode) => {
                if (err) { return callback(err) }
                return callback(null, rootNode)
              })
            }
          })
        }
        _subcalls += Object.keys(hashed).length
        for (let h in hashed) {
          if (hashed.hasOwnProperty(h)) {
            pinSet.storeItems(
              hashed[h],
              logInternalKey,
              storeItemsCb.bind({h: h}),
              _subcalls,
              _done
            )
          }
        }
      }
    },

    loadSet: (rootNode, name, logInternalKey, callback) => {
      // callback (err, keys)
      const link = rootNode.links.filter(l => l.name === name).pop()
      if (!link) { return callback('No link found with name ' + name) }
      logInternalKey(link.multihash)
      dag.get(new CID(link.multihash), (err, res) => {
        if (err) { return callback(err) }
        const keys = []
        const walkerFn = (link) => {
          keys.push(link.multihash)
        }
        pinSet.walkItems(res.value, walkerFn, logInternalKey, (err) => {
          if (err) { return callback(err) }
          return callback(null, keys)
        })
      })
    },

    walkItems: (node, walkerFn, logInternalKey, callback) => {
      // callback (err)
      const h = readHeader(node)
      if (h.err) { return callback(h.err) }
      const fanout = h.header.fanout
      let subwalkCount = 0
      let finishedCount = 0

      const walkCb = (err) => {
        if (err) { return callback(err) }
        finishedCount++
        if (subwalkCount === finishedCount) {
          return callback()
        }
      }

      for (let i = 0; i < node.links.length; i++) {
        const link = node.links[i]
        if (i >= fanout) {
          // item link
          walkerFn(link, i, h.data)
        } else {
          // fanout link
          logInternalKey(link.multihash)
          if (!emptyKey.equals(link.multihash)) {
            subwalkCount++
            dag.get(new CID(link.multihash), (err, res) => {
              if (err) { return callback(err) }
              pinSet.walkItems(
                res.value, walkerFn, logInternalKey, walkCb
              )
            })
          }
        }
      }
      if (!subwalkCount) {
        return callback()
      }
    }
  }
  return pinSet
}
