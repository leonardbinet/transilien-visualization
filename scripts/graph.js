(function(global) {

    global.Graph = function() {
        this.neighbors = {}; // Key = vertex, value = array of neighbors.
        this.cache = [];
    }

    global.Graph.prototype.addPathToCache = function(source, target, path) {
        /* This method is used to save previous found paths in following format:
        {
            source: "sourceStopId",
            target: "targetStopId",
            path: ["stop1","stop2"]  // or [] if none
        }
        
        It could be improved by commuting both stations
        */
        this.cache.push({
            source: source,
            target: target,
            path: path
        })
    };

    global.Graph.prototype.searchPathInCache = function(source, target) {
        /* This method is used to find previous found paths.
        Return undefined if not found.
        */
        var cachedResult;
        cachedResult = this.cache.find(function(d) {
            return (d.source === source && d.target === target);
        });
        if (cachedResult) {
            // console.log("Found in cache.")
            return cachedResult.path;
        }
    };

    global.Graph.prototype.addEdge = function(u, v) {

        if (this.neighbors[u] === undefined) { // Add the edge u -> v.
            this.neighbors[u] = [];
        }
        this.neighbors[u].push(v);
        if (this.neighbors[v] === undefined) { // Also add the edge v -> u in order
            this.neighbors[v] = []; // to implement an undirected graph.
        } // For a directed graph, delete
        this.neighbors[v].push(u); // these four lines.
    };

    global.Graph.prototype.bfs = function(source) {
        var queue = [{ vertex: source, count: 0 }],
            visited = { source: true },
            tail = 0;
        while (tail < queue.length) {
            var u = queue[tail].vertex,
                count = queue[tail++].count; // Pop a vertex off the queue.
            this.neighbors[u].forEach(function(v) {
                if (!visited[v]) {
                    visited[v] = true;
                    queue.push({ vertex: v, count: count + 1 });
                }
            });
        }
    };

    global.Graph.prototype.shortestPath = function(source, target) {
        /* Find shortest path in graph.
        
        It will return an array of stops between source and target (source and target are not included.)
        */
        // first check in cached results

        const cachedPath = this.searchPathInCache(source, target);
        if (cachedPath) { return cachedPath };

        if (source == target) { // Delete these four lines if
            return []; // when the source is equal to
        } // the target.
        var queue = [source],
            visited = { source: true },
            predecessor = {},
            tail = 0;
        while (tail < queue.length) {
            var u = queue[tail++], // Pop a vertex off the queue.
                neighbors = this.neighbors[u];
            if (!neighbors) {
                console.log("No neighbor for stop " + u);
                if (!state.errors.stopNoNeighboor.find(function(d) { return d === u; }))
                    state.errors.stopNoNeighboor.push(u);
                return [];
            }
            for (var i = 0; i < neighbors.length; ++i) {
                var v = neighbors[i];
                if (visited[v]) {
                    continue;
                }
                visited[v] = true;
                if (v === target) { // Check if the path is complete.
                    var path = [v]; // If so, backtrack through the path.
                    while (u !== source) {
                        path.push(u);
                        u = predecessor[u];
                    }
                    path.push(u);
                    path.reverse();
                    // remove source and target (last is excluded)
                    path = path.slice(1, path.length - 1);
                    this.addPathToCache(source, target, path);
                    return path;
                }
                predecessor[v] = u;
                queue.push(v);
            }
        }
        return [];
    };

    global.Graph.prototype.isEdge = function(source, target) {
        return (_.contains(this.neighbors[source], target));
    };

    // My custom sections
    global.SectionManager = function(sections) {
        this.sections = sections;
    };

    global.SectionManager.prototype.refreshAtTime = function(unixSeconds, positionedTrains, lastTime) {
        // "this" keyword will refer to other context in map/forEach loops
        const self = this;
        // First flush previous dir0/1 arrays, and set renderedAtTime
        this.sections.forEach(function(section) {
                section.subsections.forEach(function(subsection) {
                    // refresh all but cache
                    subsection.atTime.renderedAtTime = unixSeconds;
                    subsection.atTime.observed.dir0 = [];
                    subsection.atTime.observed.dir1 = [];
                    subsection.atTime.scheduled.dir0 = [];
                    subsection.atTime.scheduled.dir1 = [];
                })
            })
            // Then add currently active trains

        // SCHEDULED
        positionedTrains
            .filter(function(d) { return global.isActiveScheduled(unixSeconds, d); })
            .forEach(function(train) {
                var from = train.atTime.scheduled.from;
                var to = train.atTime.scheduled.to;
                self.addTrainToSubsection(from, to, train, "scheduled", lastTime);
            });

        // OBSERVED
        positionedTrains
            .filter(function(d) { return global.isActiveObserved(unixSeconds, d); })
            .forEach(function(train) {
                var from = train.atTime.observed.from;
                var to = train.atTime.observed.to;
                self.addTrainToSubsection(from, to, train, "observed", lastTime);
            });


        // OBSERVED POSTPROCESSING: cache managing
        // if time goes backward erase cache
        if (unixSeconds < lastTime) {
            this.sections.forEach(function(section) {
                section.subsections.forEach(function(subsection) {
                    subsection.atTime.observed.cachedDir0 = [];
                    subsection.atTime.observed.cachedDir1 = [];
                })
            });
        }


    };

    global.SectionManager.prototype.addTrainToSubsection = function(from, to, train, type, lastTime) {
        /* Register train on subsection. Train will also be registered in cache used to compute delay based on last trains on subsection.
         */
        const answered = this.sections.find(function(section) {
            // Find if on subsections dir0
            const dir0SubSection = section.subsections.find(
                function(subsection) {
                    return ((from === subsection.from) && (to === subsection.to));
                });
            // Find if on subsections dir1
            const dir1SubSection = section.subsections.find(
                function(subsection) {
                    return ((to === subsection.from) && (from === subsection.to));
                });
            // It can only be one
            if (dir0SubSection && dir1SubSection) {
                console.log("Error trying to assign train to subsection: for given section, two matching subsections");
                return false;
            }
            // If none stop
            if (!dir0SubSection && !dir1SubSection) { return false; }

            var matchingSubsection, direction, cachedDir;
            if (dir0SubSection) {
                matchingSubsection = dir0SubSection;
                direction = "dir0";
                cachedDir = "cachedDir0"
            } else {
                matchingSubsection = dir1SubSection;
                direction = "dir1";
                cachedDir = "cachedDir1"
            }

            // Current
            const currentTrainsContainer = matchingSubsection.atTime[type][direction];
            currentTrainsContainer.push(train);

            var cachedTrainsContainer = matchingSubsection.atTime[type][cachedDir];

            const cache = {
                lastObservedTimeOnSubsection: lastTime,
                train: train,
                delayEvolutionOnSubsection: train.atTime.observed.estimatedDelayEvolution
            }

            // check if train already on cache, if yes, remove previous before adding this one
            const alreadyCachedTrain = cachedTrainsContainer.find(function(cached) { return cached.train.trip === train.trip; });
            if (alreadyCachedTrain) {
                const index = cachedTrainsContainer.indexOf(alreadyCachedTrain);
                cachedTrainsContainer.splice(index, 1);
            }
            cachedTrainsContainer.push(cache);

            // finally, purge cache if max size is reached
            if (cachedTrainsContainer.length > global.subsectionsMaxCachedElements) {
                matchingSubsection.atTime[type][cachedDir] = cachedTrainsContainer.slice(cachedTrainsContainer.length - global.subsectionsMaxCachedElements);
            }
            return true;
        });
    }

    global.graphPreprocessing = function(graph, sections) {
        // Assign sections and subsection to stations
        sections.forEach(function(section) {
            // for each section
            section.points.forEach(function(station) {
                if (!station.linkedSections.includes(section)) { station.linkedSections.push(section); }
            });
            section.subsections.forEach(function(subsection) {
                // for each subsection
                var fromStation = subsection.from;
                var toStation = subsection.to;
                if (!fromStation.linkedSubSections.includes(subsection)) { fromStation.linkedSubSections.push(subsection); }
                if (!toStation.linkedSubSections.includes(subsection)) { toStation.linkedSubSections.push(subsection); }
            });
        });

        // fill graph with all stations and sections
        sections.forEach(function(section) {
            for (var l = 0; l < section.points.length - 1; l++) {
                var beginNode = section.points[l].stop_id;
                var endNode = section.points[l + 1].stop_id;
                graph.addEdge(beginNode, endNode);
            }
        });
    }

}(window.H))