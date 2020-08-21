(function(global) {

    global.cumulativeSum = function(arr) {
        var builder = function(acc, n) {
            var lastNum = acc.length > 0 ? acc[acc.length - 1] : 0;
            acc.push(lastNum + n);
            return acc;
        };
        return _.reduce(arr, builder, []);
    }

    global.sum = function(arr) {
        return _.reduce(arr, function(memo, num) { return memo + num; }, 0);
    };

    global.mean = function(arr) {
        var sum = global.sum(arr);
        return sum / arr.length;
    };

    global.weightedMean = function(arrVals, arrWeights) {
        var weightedValues = arrVals.map(function(val, i) { return val * arrWeights[i]; });
        var sum = global.sum(weightedValues);
        var sumWeights = global.sum(arrWeights);
        return sum / sumWeights;
    };

    global.stationsDistance = function(from, to) {
        // scaled because everything is scaled at the beginning
        var distance = Math.sqrt((from.lon - to.lon) ** 2 + (from.lat - to.lat) ** 2)
        return distance;
    }

    global.isActiveScheduled = function(unixSeconds, train) {
        return (train.begin < unixSeconds && train.end > unixSeconds)
    }

    global.isActiveObserved = function(unixSeconds, train) {
        return (train.ObservedBegin < unixSeconds && train.ObservedEnd > unixSeconds)
    }

}(window.H))