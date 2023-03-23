import {Point2D} from './point';
import {i18n} from '../utils/i18n';

/**
 * Line shape.
 *
 * @class
 * @param {Point2D} begin A Point2D representing the beginning
 *   of the line.
 * @param {Point2D} end A Point2D representing the end of the line.
 */
export class Line {

  #begin;
  #end;

  constructor(begin, end) {
    this.#begin = begin;
    this.#end = end;
  }

  /**
   * Get the begin point of the line.
   *
   * @returns {Point2D} The beginning point of the line.
   */
  getBegin() {
    return this.#begin;
  }

  /**
   * Get the end point of the line.
   *
   * @returns {Point2D} The ending point of the line.
   */
  getEnd() {
    return this.#end;
  }

  /**
   * Check for equality.
   *
   * @param {Line} rhs The object to compare to.
   * @returns {boolean} True if both objects are equal.
   */
  equals(rhs) {
    return rhs !== null &&
      this.getBegin().equals(rhs.getBegin()) &&
      this.getEnd().equals(rhs.getEnd());
  }

  /**
   * Get the line delta in the X direction.
   *
   * @returns {number} The delta in the X direction.
   */
  getDeltaX() {
    return this.getEnd().getX() - this.getBegin().getX();
  }

  /**
   * Get the line delta in the Y direction.
   *
   * @returns {number} The delta in the Y direction.
   */
  getDeltaY() {
    return this.getEnd().getY() - this.getBegin().getY();
  }

  /**
   * Get the length of the line.
   *
   * @returns {number} The length of the line.
   */
  getLength() {
    return Math.sqrt(
      this.getDeltaX() * this.getDeltaX() +
      this.getDeltaY() * this.getDeltaY()
    );
  }

  /**
   * Get the length of the line according to a  spacing.
   *
   * @param {number} spacingX The X spacing.
   * @param {number} spacingY The Y spacing.
   * @returns {number} The length of the line with spacing
   *  or null for null spacings.
   */
  getWorldLength(spacingX, spacingY) {
    var wlen = null;
    if (spacingX !== null && spacingY !== null) {
      var dxs = this.getDeltaX() * spacingX;
      var dys = this.getDeltaY() * spacingY;
      wlen = Math.sqrt(dxs * dxs + dys * dys);
    }
    return wlen;
  }

  /**
   * Get the mid point of the line.
   *
   * @returns {Point2D} The mid point of the line.
   */
  getMidpoint() {
    return new Point2D(
      parseInt((this.getBegin().getX() + this.getEnd().getX()) / 2, 10),
      parseInt((this.getBegin().getY() + this.getEnd().getY()) / 2, 10)
    );
  }

  /**
   * Get the slope of the line.
   *
   * @returns {number} The slope of the line.
   */
  getSlope() {
    return this.getDeltaY() / this.getDeltaX();
  }

  /**
   * Get the intercept of the line.
   *
   * @returns {number} The slope of the line.
   */
  getIntercept() {
    return (
      this.getEnd().getX() * this.getBegin().getY() -
      this.getBegin().getX() * this.getEnd().getY()
    ) / this.getDeltaX();
  }

  /**
   * Get the inclination of the line.
   *
   * @returns {number} The inclination of the line.
   */
  getInclination() {
    // tan(theta) = slope
    var angle = Math.atan2(this.getDeltaY(), this.getDeltaX()) * 180 / Math.PI;
    // shift?
    return 180 - angle;
  }

  /**
   * Quantify a line according to view information.
   *
   * @param {object} viewController The associated view controller.
   * @returns {object} A quantification object.
   */
  quantify(viewController) {
    var quant = {};
    // length
    var spacing = viewController.get2DSpacing();
    var length = this.getWorldLength(spacing[0], spacing[1]);
    if (length !== null) {
      quant.length = {value: length, unit: i18n('unit.mm')};
    }
    // return
    return quant;
  }

} // Line class

/**
 * Get the angle between two lines in degree.
 *
 * @param {Line} line0 The first line.
 * @param {Line} line1 The second line.
 * @returns {number} The angle.
 */
export function getAngle(line0, line1) {
  var dx0 = line0.getDeltaX();
  var dy0 = line0.getDeltaY();
  var dx1 = line1.getDeltaX();
  var dy1 = line1.getDeltaY();
  // dot = ||a||*||b||*cos(theta)
  var dot = dx0 * dx1 + dy0 * dy1;
  // cross = ||a||*||b||*sin(theta)
  var det = dx0 * dy1 - dy0 * dx1;
  // tan = sin / cos
  var angle = Math.atan2(det, dot) * 180 / Math.PI;
  // complementary angle
  // shift?
  return 360 - (180 - angle);
}

/**
 * Get a perpendicular line to an input one.
 *
 * @param {Line} line The line to be perpendicular to.
 * @param {Point2D} point The middle point of the perpendicular line.
 * @param {number} length The length of the perpendicular line.
 * @returns {object} A perpendicular line.
 */
export function getPerpendicularLine(line, point, length) {
  // begin point
  var beginX = 0;
  var beginY = 0;
  // end point
  var endX = 0;
  var endY = 0;

  // check slope:
  // 0 -> horizontal
  // Infinite -> vertical (a/Infinite = 0)
  if (line.getSlope() !== 0) {
    // a0 * a1 = -1
    var slope = -1 / line.getSlope();
    // y0 = a1*x0 + b1 -> b1 = y0 - a1*x0
    var intercept = point.getY() - slope * point.getX();

    // 1. (x - x0)^2 + (y - y0)^2 = d^2
    // 2. a = (y - y0) / (x - x0) -> y = a*(x - x0) + y0
    // ->  (x - x0)^2 + m^2 * (x - x0)^2 = d^2
    // -> x = x0 +- d / sqrt(1+m^2)

    // length is the distance between begin and end,
    // point is half way between both -> d = length / 2
    var dx = length / (2 * Math.sqrt(1 + slope * slope));

    // begin point
    beginX = point.getX() - dx;
    beginY = slope * beginX + intercept;
    // end point
    endX = point.getX() + dx;
    endY = slope * endX + intercept;
  } else {
    // horizontal input line -> perpendicular is vertical!
    // begin point
    beginX = point.getX();
    beginY = point.getY() - length / 2;
    // end point
    endX = point.getX();
    endY = point.getY() + length / 2;
  }
  // perpendicalar line
  return new Line(
    new Point2D(beginX, beginY),
    new Point2D(endX, endY));
}
