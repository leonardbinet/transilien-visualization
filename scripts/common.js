export function isActiveScheduled(unixSeconds, train) {
  return train.begin < unixSeconds && train.end > unixSeconds;
}

export function isActiveObserved(unixSeconds, train) {
  return train.ObservedBegin < unixSeconds && train.ObservedEnd > unixSeconds;
}
