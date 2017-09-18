// Copyright IBM Corp. 2017. All Rights Reserved.
// Node module: ibmapm
// This file is licensed under the Apache License 2.0.
// License text available at https://opensource.org/licenses/Apache-2.0

var healthcenter = global.APPMETRICS = global.APPMETRICS || require('appmetrics');
var log4js = require('log4js');
var logger = log4js.getLogger('knj_log');
var commonTools = require('./tool/common');

var dd_defaultConfig = {
    enabled: false,
    excludeModules: [],
    minClockTrace: 0,
    minClockStack: 0,
    minCpuTrace: 0,
    minCpuStack: 0,
    eventsPerFile: 1000,
    fileCommitTime: 20,
    maxFiles: 300
};

function parseFilters(cfg) {
    try {
        cfg.filters = cfg.filters.map(function(filter) {
            return {
                regex: new RegExp(filter.pattern),
                pattern: filter.pattern,
                to: filter.to
            };
        });
    } catch (e) {
        logger.error('Error in configuration on filters: ' + e);
        logger.error('Deepdive will be disabled');
        cfg.enabled = false;
    }
};

var cfg = {};
var reqcfg = {};
var mProbes = {};

module.exports.init = function(config) {
    if (config && config.deepDive) {
        cfg = config;
        cfg.deepDive.filters = config.filters || [];
    } else {
        cfg = {};
        cfg.deepDive = dd_defaultConfig;
        cfg.filters = cfg.deepDive.filters = [];
    }
    cfg.deepDive.excludeModules = dd_defaultConfig.excludeModules;

    if (process.env.VCAP_SERVICES) {
        var enabled = false;
        var maConfig = {};
        var MAServiceName = 'MonitoringAndAnalytics';
        if (process.env.APM_MONITORING_SERVICE_NAME) {
            MAServiceName = process.env.APM_MONITORING_SERVICE_NAME;
        }
        var env = JSON.parse(process.env.VCAP_SERVICES);
        if (env[MAServiceName]) {
            var plan = env[MAServiceName][0].credentials.service_plan;
            if (plan.indexOf('DeepDive-IBM-APM-Monitoring-Analytics-') === 0) {
                enabled = true;
            }
            if (!env[MAServiceName][0].credentials.apphost) {
                env[MAServiceName][0].credentials.apphost = 'test';
            }
            maConfig = env[MAServiceName][0].credentials || {};
        }
        enabled = process.env.KNJ_ENABLE_DEEPDIVE;

        cfg.deepDive.enabled = enabled;
        cfg.deepDive.maConfig = maConfig;
    }

    if (process.env.KNJ_SAMPLING) {
        cfg.deepDive.sampling = process.env.KNJ_SAMPLING;
    }
    if (process.env.KNJ_MIN_CLOCK_TRACE) {
        cfg.deepDive.minClockTrace = process.env.KNJ_MIN_CLOCK_TRACE;
    }
    if (process.env.KNJ_MIN_CLOCK_STACK) {
        cfg.deepDive.minClockStack = process.env.KNJ_MIN_CLOCK_STACK;
    }
    if (process.env.KNJ_EVENTS_PER_FILE) {
        cfg.deepDive.eventsPerFile = process.env.KNJ_EVENTS_PER_FILE;
    }
    if (process.env.KNJ_FILE_COMMIT_TIME) {
        cfg.deepDive.fileCommitTime = process.env.KNJ_FILE_COMMIT_TIME;
    }
    if (commonTools.testTrue(process.env.KNJ_ENABLE_METHODTRACE)) {
        cfg.deepDive.methodTrace = true;
    } else {
        cfg.deepDive.methodTrace = false;
    }
    if (process.env.APM_BM_SECURE_GATEWAY || process.env.APM_BM_GATEWAY_URL
            || process.env.MONITORING_SERVER_URL) {
        cfg.deepDive.enabled = true;
    }
    return cfg;
};

module.exports.update = function(config) {
    var newConfig = module.exports.init(config);
    var requestConfig = {
        minClockTrace: newConfig.deepDive.minClockTrace,
        minCpuTrace: newConfig.deepDive.minCpuTrace,
        minCpuStack: newConfig.deepDive.minCpuStack,
        minClockStack: newConfig.deepDive.minClockStack,
        excludeModules: mProbes.excludeModules,
        includeModules: mProbes.includeModules
    };
    cfg = newConfig;
    reqcfg = requestConfig;
    parseFilters(cfg);

    if (commonTools.testTrue(process.env.KNJ_ENABLE_TT) ||
        commonTools.testTrue(process.env.KNJ_ENABLE_DEEPDIVE) ||
        process.env.APM_BM_SECURE_GATEWAY || process.env.APM_BM_GATEWAY_URL ||
        process.env.MONITORING_SERVER_URL) {
        logger.info('Configuration updated: deepdive is enabled');
        healthcenter.enable('requests', requestConfig);
        if (commonTools.testTrue(process.env.KNJ_ENABLE_TT) ||
            commonTools.testTrue(process.env.KNJ_ENABLE_METHODTRACE)) {
            healthcenter.enable('trace');
        }
    } else {
        logger.info('Configuration updated: deepdive is disabled');
        healthcenter.setConfig('requests', requestConfig);
        healthcenter.disable('requests');
        healthcenter.disable('trace');
    }
    var httpCfg = {
        filters: newConfig.filters
    };
    healthcenter.setConfig('http', httpCfg);
};

module.exports.getConfig = function(){
    return cfg;
};

module.exports.getReqConfig = function(){
    return reqcfg;
};

module.exports.getMethodProbes = function(){
    return mProbes;
};

module.exports.setMethodProbes = function(p){
    mProbes.includeModules = cfg.deepDive.includeModules
            = p.include_modules ? p.include_modules : [];
    mProbes.excludeModules = cfg.deepDive.excludeModules
            = p.exclude_modules ? p.exclude_modules : [];
};
