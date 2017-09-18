// Copyright IBM Corp. 2017. All Rights Reserved.
// Node module: ibmapm
// This file is licensed under the Apache License 2.0.
// License text available at https://opensource.org/licenses/Apache-2.0

exports.testTrue = function(v) {
    if (v && ['false', 'False', 'FALSE', ''].indexOf(v) < 0) {
        return true;
    } else {
        return false;
    }
};

exports.transferTimezoneToString = function(zone) {
    var result = '';
    if (zone > 0) {
        result += '-';
    } else {
        result += '+';
    }
    var pureZone = Math.abs(zone);
    var intZone = Math.floor(pureZone);
    if (intZone >= 10) {
        result += (intZone + ':');
    } else {
        result += ('0' + intZone + ':');
    }
    if (pureZone - intZone) {
        result += '30';
    } else {
        result += '00';
    }
    return result;
};

exports.getFullURL = function(url, ip, port, protocol) {
    var result = '';
    if (url.indexOf('http') === 0){
        result = url;
    } else if (protocol && protocol.indexOf('HTTPS') === 0) {
        result += ('https://' + ip + (port ? ':' + port : '') + url);
    } else {
        result += ('http://' + ip + (port ? ':' + port : '') + url);
    }

    return result;
};

exports.merge = function(jsonArray) {
    var jsonMerged = {};
    for (var x in jsonArray) {
        var json = jsonArray[x];
        var jsonKeys = Object.keys(json);
        for (var i in jsonKeys) {
            var key = jsonKeys[i];
            jsonMerged[key] = json[key];
        }
    }
    return jsonMerged;
};
