/**
 * Script Include: VehicleSalesUtils
 * Utility functions for the Vehicle Sales application
 */
var VehicleSalesUtils = Class.create();

VehicleSalesUtils.prototype = {
  initialize: function() {},

  /**
   * Returns total number of vehicles sold in a given date range.
   * @param {string} startDate - ISO date string (YYYY-MM-DD)
   * @param {string} endDate   - ISO date string (YYYY-MM-DD)
   * @returns {number}
   */
  getSalesCount: function(startDate, endDate) {
    var gr = new GlideRecord('u_vehicle_sales');
    gr.addQuery('u_sale_status', 'sold');
    if (startDate) gr.addQuery('u_sale_date', '>=', startDate);
    if (endDate)   gr.addQuery('u_sale_date', '<=', endDate);
    gr.query();
    return gr.getRowCount();
  },

  /**
   * Returns total revenue from sales in a given date range.
   * @param {string} startDate
   * @param {string} endDate
   * @returns {number}
   */
  getTotalRevenue: function(startDate, endDate) {
    var gr = new GlideRecord('u_vehicle_sales');
    gr.addQuery('u_sale_status', 'sold');
    if (startDate) gr.addQuery('u_sale_date', '>=', startDate);
    if (endDate)   gr.addQuery('u_sale_date', '<=', endDate);
    gr.query();

    var total = 0;
    while (gr.next()) {
      total += parseFloat(gr.u_sale_price.toString()) || 0;
    }
    return total;
  },

  /**
   * Returns sales breakdown grouped by make.
   * @returns {Object} map of make -> count
   */
  getSalesByMake: function() {
    var gr = new GlideAggregate('u_vehicle_sales');
    gr.addQuery('u_sale_status', 'sold');
    gr.addAggregate('COUNT', 'u_make');
    gr.groupBy('u_make');
    gr.query();

    var result = {};
    while (gr.next()) {
      result[gr.u_make.toString()] = parseInt(gr.getAggregate('COUNT', 'u_make'));
    }
    return result;
  },

  /**
   * Returns the top N salespeople by units sold.
   * @param {number} limit
   * @returns {Array}
   */
  getTopSalespeople: function(limit) {
    limit = limit || 5;
    var gr = new GlideAggregate('u_vehicle_sales');
    gr.addQuery('u_sale_status', 'sold');
    gr.addAggregate('COUNT', 'u_salesperson');
    gr.groupBy('u_salesperson');
    gr.orderByAggregate('COUNT', 'u_salesperson', false);
    gr.setLimit(limit);
    gr.query();

    var result = [];
    while (gr.next()) {
      result.push({
        salesperson: gr.u_salesperson.getDisplayValue(),
        units_sold: parseInt(gr.getAggregate('COUNT', 'u_salesperson'))
      });
    }
    return result;
  },

  /**
   * Returns average discount off asking price for sold vehicles.
   * @returns {number} average discount as a percentage
   */
  getAverageDiscount: function() {
    var gr = new GlideRecord('u_vehicle_sales');
    gr.addQuery('u_sale_status', 'sold');
    gr.addNullQuery('u_sale_price', false);
    gr.query();

    var totalDiscount = 0;
    var count = 0;
    while (gr.next()) {
      var asking = parseFloat(gr.u_asking_price.toString()) || 0;
      var sale   = parseFloat(gr.u_sale_price.toString()) || 0;
      if (asking > 0) {
        totalDiscount += ((asking - sale) / asking) * 100;
        count++;
      }
    }
    return count > 0 ? (totalDiscount / count).toFixed(2) : 0;
  },

  type: 'VehicleSalesUtils'
};
