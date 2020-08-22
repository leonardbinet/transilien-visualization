(function (global) {
  global.isActiveScheduled = function (unixSeconds, train) {
    return train.begin < unixSeconds && train.end > unixSeconds;
  };

  global.isActiveObserved = function (unixSeconds, train) {
    return train.ObservedBegin < unixSeconds && train.ObservedEnd > unixSeconds;
  };
})(window.H);
