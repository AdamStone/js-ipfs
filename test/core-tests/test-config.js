/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const IPFS = require('../../src/core')

describe('config', () => {
  var defaultConfig = {
    Identity: {
      PeerID: 'QmQ2zigjQikYnyYUSXZydNXrDRhBut2mubwJBaLXobMt3A',
      PrivKey: 'CAASpgkwggSiAgEAAoIBAQC2SKo/HMFZeBml1AF3XijzrxrfQXdJzjePBZAbdxqKR1Mc6juRHXij6HXYPjlAk01BhF1S3Ll4Lwi0cAHhggf457sMg55UWyeGKeUv0ucgvCpBwlR5cQ020i0MgzjPWOLWq1rtvSbNcAi2ZEVn6+Q2EcHo3wUvWRtLeKz+DZSZfw2PEDC+DGPJPl7f8g7zl56YymmmzH9liZLNrzg/qidokUv5u1pdGrcpLuPNeTODk0cqKB+OUbuKj9GShYECCEjaybJDl9276oalL9ghBtSeEv20kugatTvYy590wFlJkkvyl+nPxIH0EEYMKK9XRWlu9XYnoSfboiwcv8M3SlsjAgMBAAECggEAZtju/bcKvKFPz0mkHiaJcpycy9STKphorpCT83srBVQi59CdFU6Mj+aL/xt0kCPMVigJw8P3/YCEJ9J+rS8BsoWE+xWUEsJvtXoT7vzPHaAtM3ci1HZd302Mz1+GgS8Epdx+7F5p80XAFLDUnELzOzKftvWGZmWfSeDnslwVONkL/1VAzwKy7Ce6hk4SxRE7l2NE2OklSHOzCGU1f78ZzVYKSnS5Ag9YrGjOAmTOXDbKNKN/qIorAQ1bovzGoCwx3iGIatQKFOxyVCyO1PsJYT7JO+kZbhBWRRE+L7l+ppPER9bdLFxs1t5CrKc078h+wuUr05S1P1JjXk68pk3+kQKBgQDeK8AR11373Mzib6uzpjGzgNRMzdYNuExWjxyxAzz53NAR7zrPHvXvfIqjDScLJ4NcRO2TddhXAfZoOPVH5k4PJHKLBPKuXZpWlookCAyENY7+Pd55S8r+a+MusrMagYNljb5WbVTgN8cgdpim9lbbIFlpN6SZaVjLQL3J8TWH6wKBgQDSChzItkqWX11CNstJ9zJyUE20I7LrpyBJNgG1gtvz3ZMUQCn3PxxHtQzN9n1P0mSSYs+jBKPuoSyYLt1wwe10/lpgL4rkKWU3/m1Myt0tveJ9WcqHh6tzcAbb/fXpUFT/o4SWDimWkPkuCb+8j//2yiXk0a/T2f36zKMuZvujqQKBgC6B7BAQDG2H2B/ijofp12ejJU36nL98gAZyqOfpLJ+FeMz4TlBDQ+phIMhnHXA5UkdDapQ+zA3SrFk+6yGk9Vw4Hf46B+82SvOrSbmnMa+PYqKYIvUzR4gg34rL/7AhwnbEyD5hXq4dHwMNsIDq+l2elPjwm/U9V0gdAl2+r50HAoGALtsKqMvhv8HucAMBPrLikhXP/8um8mMKFMrzfqZ+otxfHzlhI0L08Bo3jQrb0Z7ByNY6M8epOmbCKADsbWcVre/AAY0ZkuSZK/CaOXNX/AhMKmKJh8qAOPRY02LIJRBCpfS4czEdnfUhYV/TYiFNnKRj57PPYZdTzUsxa/yVTmECgYBr7slQEjb5Onn5mZnGDh+72BxLNdgwBkhO0OCdpdISqk0F0Pxby22DFOKXZEpiyI9XYP1C8wPiJsShGm2yEwBPWXnrrZNWczaVuCbXHrZkWQogBDG3HGXNdU4MAWCyiYlyinIBpPpoAJZSzpGLmWbMWh28+RJS6AQX6KHrK1o2uw==' },
    Datastore: { Type: '',
      Path: '',
      StorageMax: '',
      StorageGCWatermark: 0,
      GCPeriod: '',
      Params: null,
    NoSync: false },
    Addresses: { Swarm: [ '/ip4/0.0.0.0/tcp/0' ],
      API: '/ip4/127.0.0.1/tcp/6001',
    Gateway: '/ip4/127.0.0.1/tcp/0' },
    Mounts: { IPFS: '/ipfs', IPNS: '/ipns', FuseAllowOther: false },
    Version: { Current: '0.4.0-dev',
      Check: 'error',
      CheckDate: '0001-01-01T00:00:00Z',
      CheckPeriod: '172800000000000',
    AutoUpdate: 'minor' },
    Discovery: { MDNS: { Enabled: true, Interval: 10 } },
    Ipns: { RepublishPeriod: '',
      RecordLifetime: '',
    ResolveCacheSize: 128 },
    Bootstrap: [ '/ip4/104.131.131.82/tcp/4001/ipfs/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ',
      '/ip4/104.236.176.52/tcp/4001/ipfs/QmSoLnSGccFuZQJzRadHn95W2CrSFmZuTdDWP8HXaHca9z',
      '/ip4/104.236.179.241/tcp/4001/ipfs/QmSoLPppuBtQSGwKDZT2M73ULpjvfd3aZ6ha4oFGL1KrGM',
      '/ip4/162.243.248.213/tcp/4001/ipfs/QmSoLueR4xBeUbY9WZ9xGUUxunbKWcrNFTDAadQJmocnWm',
      '/ip4/128.199.219.111/tcp/4001/ipfs/QmSoLSafTMBsPKadTEgaXctDQVcqN88CNLHXMkTNwMKPnu',
      '/ip4/104.236.76.40/tcp/4001/ipfs/QmSoLV4Bbm51jM9C4gDYZQ9Cy3U6aXMJDAbzgu2fzaDs64',
      '/ip4/178.62.158.247/tcp/4001/ipfs/QmSoLer265NRgSp2LA3dPaeykiS1J6DifTC88f5uVQKNAd',
      '/ip4/178.62.61.185/tcp/4001/ipfs/QmSoLMeWqB7YGVLJN3pNLQpmmEk35v6wYtsMGLzSr5QBU3',
      '/ip4/104.236.151.122/tcp/4001/ipfs/QmSoLju6m7xTh3DuokvT3886QRYqxAzb1kShaanJgW36yx' ],
    Tour: { Last: '' },
    Gateway: { HTTPHeaders: null, RootRedirect: '', Writable: false },
    SupernodeRouting: {
      Servers: [
        '/ip4/104.236.176.52/tcp/4002/ipfs/QmXdb7tWTxdFEQEFgWBqkuYSrZd3mXrC7HxkD4krGNYx2U',
        '/ip4/104.236.179.241/tcp/4002/ipfs/QmVRqViDByUxjUMoPnjurjKvZhaEMFDtK35FJXHAM4Lkj6',
        '/ip4/104.236.151.122/tcp/4002/ipfs/QmSZwGx8Tn8tmcM4PtDJaMeUQNRhNFdBLVGPzRiNaRJtFH',
        '/ip4/162.243.248.213/tcp/4002/ipfs/QmbHVEEepCi7rn7VL7Exxpd2Ci9NNB6ifvqwhsrbRMgQFP',
        '/ip4/128.199.219.111/tcp/4002/ipfs/Qmb3brdCYmKG1ycwqCbo6LUwWxTuo3FisnJV2yir7oN92R',
        '/ip4/104.236.76.40/tcp/4002/ipfs/QmdRBCV8Cz2dGhoKLkD3YjPwVFECmqADQkx5ZteF2c6Fy4',
        '/ip4/178.62.158.247/tcp/4002/ipfs/QmUdiMPci7YoEUBkyFZAh2pAbjqcPr7LezyiPD2artLw3v',
        '/ip4/178.62.61.185/tcp/4002/ipfs/QmVw6fGNqBixZE4bewRLT2VXX7fAHUHs8JyidDiJ1P7RUN'
      ]
    },
    API: {
      HTTPHeaders: null
    },
    Swarm: {
      AddrFilters: null
    },
    Log: {
      MaxSizeMB: 250,
      MaxBackups: 1,
      MaxAgeDays: 0
    }
  }

  var ipfs

  before((done) => {
    ipfs = new IPFS(require('./repo-path'))
    ipfs.load(done)
  })

  it('show', (done) => {
    ipfs.config.show((err, config) => {
      expect(err).to.not.exist
      expect(config).to.deep.equal(defaultConfig)
      done()
    })
  })

  it('replace', (done) => {
    ipfs = new IPFS(require('./repo-path'))
    ipfs.config.replace({}, (err) => {
      expect(err).to.not.exist
      ipfs.config.show((err, config) => {
        expect(err).to.not.exist
        expect(config).to.deep.equal({})
        ipfs.config.replace(defaultConfig, (err) => {
          expect(err).to.not.exist
          done()
        })
      })
    })
  })

// cli only feature built with show and replace
// it.skip('edit', (done) => {
//  ipfs = new IPFS(require('./repo-pathe'))
//  ipfs.config((err, config) => {
//    expect(err).to.not.exist
//    done()
//  })
// })
})
