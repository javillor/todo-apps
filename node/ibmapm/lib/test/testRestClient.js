// Copyright IBM Corp. 2017. All Rights Reserved.
// Node module: ibmapm
// This file is licensed under the Apache License 2.0.
// License text available at https://opensource.org/licenses/Apache-2.0

process.env.KNJ_LOG_LEVEL = 'off';
process.env.KNJ_CONFIG_FILE = 'lib/test/test-config.json';

var assert = require('chai').assert;
var restClient = require('../knj-restclient');
var expect = require('chai').expect;
var uuid = require('uuid');


function testTrue(v) {
    if (v && ['false', 'False', 'FALSE', ''].indexOf(v) < 0) {
        return true;
    } else {
        return false;
    }
};

var metricPayload = {
    resourceID: 'joycetest',
    dimensions: {
        name: 'joyce_test'
    },
    metrics: {
        JOYCE: 123,
        FEI: 456
    }
};
var dcRegPayload = {
    id: 'nj-test-provider',
    type: [ 'datacollector' ],
    properties: {
        monitoringLevel: 'L1',
        diagnosticsEnabled: false,
        methodTracingEnabled: false
    }
};
var res1RegPayload = {
    id: 'resource1',
    type: [ 'nodeapp' ],
    properties: {
        version: 'nodeversion',
        name: 'joycetest',
        displayName: 'joycetest',
        pid: '123'
    },
    references: [
        { type: 'manages', direction: 'from', id: 'nj-test-provider', nodetype: 'provider' },
        { type: 'uses', direction: 'to', id: 'resource2' }
    ]
};
var res2RegPayload = {
    id: 'resource2',
    type: [ 'nodegc' ],
    displayLabel: 'gc on joycetest',
    startTime: (new Date()).toISOString(), // '2016-05-27T03:21:25.432Z'
    properties: {
        version: 'v8version',
        name: 'gc on joycetest',
        displayName: 'gc on joycetest',
        pid: '123'
    }
};

var aarPayload = {
    properties: {
        documentType: '/AAR/Middleware/NODEJS',
        softwareServerType: 'http://open-services.net/ns/crtv#NodeJS',
        softwareModuleName: 'abc',
        resourceID: 'resource1',
        processID: process.pid,
        diagnosticsEnabled: testTrue(process.env.KNJ_ENABLE_DEEPDIVE),
        applicationName: 'abc',
        serverName: 'hostname',
        serverAddress: '9.98.38.144',
        requestName: '/a/b/c',
        documentVersion: '2.0', // why?
        startTime: (new Date()).toISOString(),
        finishTime: (new Date()).toISOString(),
        documentID: uuid.v1()
    },
    metrics: {
        status: 'Good',
        responseTime: 100
    }
};

before(function() {
    restClient.setConfiguration('./test/test-config.json');
});

describe('Configuration', function() {

    describe('#getConfiguration()', function() {

        it('configuration items should be correct', function() {
            assert.equal('http://1.2.3.4:80/1.0/monitoring/data',
                restClient.getConfiguration().ingressURL);
            assert.equal('6defb2b3-4e44-463b-9731-09c64e7fdb67', restClient
                .getConfiguration().tenantID);
            assert.equal('metric', restClient.getConfiguration().metrics);
            assert.equal('aar/middleware', restClient.getConfiguration().AAR);
            assert.equal('adr/middleware', restClient.getConfiguration().ADR);
        });
    });

});

describe('Register items', function() {
    this.timeout(15000);
    describe('#registerDC and resource', function() {
        it('register a single dc', function(done) {
            this.timeout(10000);
            restClient.registerDC(dcRegPayload, function(err, res) {
                if (err) {
                    done(err);
                } else {
                    expect(res).to.have.property('statusCode').and.be.oneOf([200, 202]);
                    done();
                }
            });
        });
        it('register a single resource', function(done) {
            restClient.registerResource(res1RegPayload, function(err, res) {
                if (err) {
                    done(err);
                } else {
                    expect(res).to.have.property('statusCode').and.be.oneOf([200, 202]);
                    done();
                }
            });
        });
        it('register another single resource', function(done) {
            restClient.registerResource(res2RegPayload, function(err, res) {
                if (err) {
                    done(err);
                } else {
                    expect(res).to.have.property('statusCode').and.be.oneOf([200, 202]);
                    done();
                }
            });
        });
    });
});

describe('SendMetric', function() {
    it('sendmetric should be done', function(done) {
        restClient.sendMetrics(metricPayload, function(err, res) {
            if (err) {
                done(err);
            } else {
                expect(res).to.have.property('statusCode').and.be.oneOf([200, 202]);
                done();
            }
        });
    });

});
process.env.KNJ_AAR_BATCH_COUNT = 1;
describe('SendAAR', function() {
    it('sendmetric should be done', function(done) {
        restClient.sendAAR(aarPayload, function(err, res) {
            if (err) {
                done(err);
            } else {
                expect(res).to.have.property('statusCode').and.be.oneOf([200, 202]);
                done();
            }
        });
    });

});

