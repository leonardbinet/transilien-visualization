//// Selectors

export const svgSelector = "#map-svg";
export const toolTipSelector = "#tooltip";
// Canvas parameters
export const hborder = 25;
export const wborder = 80;
export const width = 500 + 2 * wborder;
export const height = 500 + 2 * hborder;

// Chosen line
export const line = "H";
// Size of trains: to compute distance from path
export const mapGlyphTrainCircleRadius = 4.0;

// Timer
export const smoothness = 0.7;

// Subsections cache for computing delay evolutions
export const subsectionsMaxCachedElements = 8;
// max taken into account is 20 mins
export const maxFreshness = 1200;
// Subsection width (scaled afterwards)
export const subsectionWidth = 40;
export const scale = 20;

export const delayMapColorScale = d3.scale
  .linear()
  .interpolate(d3.interpolateLab)
  .domain([-300, 60, 600])
  .range(["rgb(0, 104, 55)", "rgb(255, 255, 255)", "rgb(165, 0, 38)"]);

export const visibleStations = [
  { id: "StopPoint:DUA8727600" },
  { id: "StopPoint:DUA8727103" },
  { id: "StopPoint:DUA8727613", reverse: true },
  { id: "StopPoint:DUA8727657" },
];
