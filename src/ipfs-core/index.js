'use strict'

const defaultRepo = require('./default-repo')
// const bl = require('bl')
const blocks = require('ipfs-blocks')
const BlockService = blocks.BlockService
const Block = blocks.Block
const mDAG = require('ipfs-merkle-dag')
const DAGNode = mDAG.DAGNode
const DAGService = mDAG.DAGService
const importer = require('ipfs-data-importing').import

exports = module.exports = IPFS

function IPFS (repo) {
  if (!(this instanceof IPFS)) {
    throw new Error('Must be instantiated with new')
  }

  if (!repo) {
    repo = defaultRepo()
  }
  const blockS = new BlockService(repo)
  const dagS = new DAGService(blockS)

  this.daemon = callback => {
    // 1. read repo to get peer data
  }

  this.version = (opts, callback) => {
    if (typeof opts === 'function') {
      callback = opts
      opts = {}
    }

    repo.exists((err, exists) => {
      if (err) { return callback(err) }

      repo.config.get((err, config) => {
        if (err) { return callback(err) }

        callback(null, config.Version.Current)
      })
    })
  }

  this.id = (opts, callback) => {
    if (typeof opts === 'function') {
      callback = opts
      opts = {}
    }
    repo.exists((err, exists) => {
      if (err) { return callback(err) }

      repo.config.get((err, config) => {
        if (err) {
          return callback(err)
        }
        callback(null, {
          ID: config.Identity.PeerID,
          // TODO needs https://github.com/diasdavid/js-peer-id/blob/master/src/index.js#L76
          PublicKey: '',
          Addresses: config.Addresses,
          AgentVersion: 'js-ipfs',
          ProtocolVersion: '9000'
        })
      })
    })
  }

  this.repo = {
    init: (bits, force, empty, callback) => {
      // 1. check if repo already exists
    },

    version: (opts, callback) => {
      if (typeof opts === 'function') {
        callback = opts
        opts = {}
      }
      repo.exists((err, res) => {
        if (err) { return callback(err) }
        repo.version.read(callback)
      })
    },

    gc: function () {}
  }

  this.bootstrap = {
    list: (callback) => {
      repo.config.get((err, config) => {
        if (err) { return callback(err) }
        callback(null, config.Bootstrap)
      })
    },
    add: (multiaddr, callback) => {
      repo.config.get((err, config) => {
        if (err) { return callback(err) }
        config.Bootstrap.push(multiaddr)
        repo.config.set(config, err => {
          if (err) { return callback(err) }

          callback()
        })
      })
    },
    rm: (multiaddr, callback) => {
      repo.config.get((err, config) => {
        if (err) { return callback(err) }
        config.Bootstrap = config.Bootstrap.filter(mh => {
          if (mh === multiaddr) {
            return false
          } else { return true }
        })
        repo.config.set(config, err => {
          if (err) { return callback(err) }
          callback()
        })
      })
    }
  }

  this.config = {
    // cli only feature built with show and replace
    // edit: (callback) => {},
    replace: (config, callback) => {
      repo.config.set(config, callback)
    },
    show: callback => {
      repo.config.get((err, config) => {
        if (err) { return callback(err) }
        callback(null, config)
      })
    }
  }

  this.block = {
    get: (multihash, callback) => {
      blockS.getBlock(multihash, callback)
    },
    put: (block, callback) => {
      blockS.addBlock(block, callback)
    },
    del: (multihash, callback) => {
      blockS.deleteBlock(multihash, callback)
    },
    stat: (multihash, callback) => {
      blockS.getBlock(multihash, (err, block) => {
        if (err) {
          return callback(err)
        }
        callback(null, {
          Key: multihash,
          Size: block.data.length
        })
      })
    }
  }

  this.object = {
    new: (template, callback) => {
      if (!callback) {
        callback = template
      }
      var node = new DAGNode()
      var block = new Block(node.marshal())
      blockS.addBlock(block, function (err) {
        if (err) {
          return callback(err)
        }
        callback(null, {
          Hash: block.key,
          Size: node.size(),
          Name: ''
        })
      })
    },
    patch: {
      appendData: (multihash, data, callback) => {
        this.object.get(multihash, (err, obj) => {
          if (err) { return callback(err) }
          obj.data = Buffer.concat([obj.data, data])
          dagS.add(obj, (err) => {
            if (err) {
              return callback(err)
            }
            callback(null, obj.multihash())
          })
        })
      },
      addLink: (multihash, link, callback) => {
        this.object.get(multihash, (err, obj) => {
          if (err) { return callback(err) }
          obj.addRawLink(link)
          dagS.add(obj, (err) => {
            if (err) {
              return callback(err)
            }
            callback(null, obj.multihash())
          })
        })
      },
      rmLink: (multihash, multihashLink, callback) => {
        this.object.get(multihash, (err, obj) => {
          if (err) { return callback(err) }
          obj.links = obj.links.filter((link) => {
            if (link.hash.equals(multihashLink)) {
              return false
            }
            return true
          })
          dagS.add(obj, (err) => {
            if (err) {
              return callback(err)
            }
            callback(null, obj.multihash())
          })
        })
      },
      setData: (multihash, data, callback) => {
        this.object.get(multihash, (err, obj) => {
          if (err) { return callback(err) }
          obj.data = data
          dagS.add(obj, (err) => {
            if (err) {
              return callback(err)
            }
            callback(null, obj.multihash())
          })
        })
      }
    },
    data: (multihash, callback) => {
      this.object.get(multihash, (err, obj) => {
        if (err) {
          return callback(err)
        }
        callback(null, obj.data)
      })
    },
    links: (multihash, callback) => {
      this.object.get(multihash, (err, obj) => {
        if (err) {
          return callback(err)
        }
        callback(null, obj.links)
      })
    },
    get: (multihash, options, callback) => {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      dagS.get(multihash, callback)
    },
    put: (dagNode, options, callback) => {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      dagS.add(dagNode, callback)
    },
    stat: (multihash, options, callback) => {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }

      this.object.get(multihash, (err, obj) => {
        if (err) {
          return callback(err)
        }
        var res = {
          NumLinks: obj.links.length,
          BlockSize: obj.marshal().length,
          LinksSize: obj.links.reduce((prev, link) => {
            return prev + link.size
          }, 0),
          DataSize: obj.data.length,
          CumulativeSize: ''
        }
        callback(null, res)
      })
    }
  }

  this.files = {
    add: (path, options, callback) => {
      options.path = path
      options.dagService = dagS
      importer(options, callback)
    }
  }
}
