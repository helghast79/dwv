var dwv = dwv || {};
dwv.test = dwv.test || {};

// Image decoders (for web workers)
dwv.image.decoderScripts = {
  jpeg2000: '../../decoders/pdfjs/decode-jpeg2000.js',
  'jpeg-lossless': '../../decoders/rii-mango/decode-jpegloss.js',
  'jpeg-baseline': '../../decoders/pdfjs/decode-jpegbaseline.js',
  rle: '../../decoders/dwv/decode-rle.js'
};
// logger level (optional)
dwv.logger.level = dwv.utils.logger.levels.DEBUG;

// check environment support
dwv.env.check();

var _app = null;
var _tools = null;

// viewer options
var _mode = 0;
var _dicomWeb = false;

// example private logic for time value retrieval
// dwv.dicom.DicomElementsWrapper.prototype.getTime = function () {
//   var value;
//   var time = this.getFromKey('xABCD0123');
//   if (typeof time !== 'undefined') {
//     value = parseInt(time, 10);
//   }
//   return value;
// };

/**
 * Setup simple dwv app.
 */
dwv.test.viewerSetup = function () {
  // stage options
  var dataViewConfigs;
  var viewOnFirstLoadItem = true;

  // use for concurrent load
  var numberOfDataToLoad = 1;

  if (_mode === 0) {
    // simplest: one layer group
    dataViewConfigs = prepareAndGetSimpleDataViewConfig();
  } else if (_mode === 1) {
    // MPR
    viewOnFirstLoadItem = false;
    dataViewConfigs = prepareAndGetMPRDataViewConfig();
  } else if (_mode === 2) {
    // simple side by side
    addLayerGroup('layerGroupA');
    addLayerGroup('layerGroupB');
    dataViewConfigs = {
      0: [
        {
          divId: 'layerGroupA'
        }
      ],
      1: [
        {
          divId: 'layerGroupB'
        }
      ]
    };
  } else if (_mode === 3) {
    // multiple data, multiple layer group
    addLayerGroup('layerGroupA');
    addLayerGroup('layerGroupB');
    dataViewConfigs = {
      0: [
        {
          divId: 'layerGroupA'
        },
        {
          divId: 'layerGroupB'
        }
      ],
      1: [
        {
          divId: 'layerGroupA'
        }
      ],
      2: [
        {
          divId: 'layerGroupB'
        }
      ],
      3: [
        {
          divId: 'layerGroupB'
        }
      ]
    };
  }

  // tools
  _tools = {
    Scroll: {},
    WindowLevel: {},
    ZoomAndPan: {},
    Opacity: {},
    Draw: {options: ['Rectangle']}
  };

  // app config
  var config = {
    viewOnFirstLoadItem: viewOnFirstLoadItem,
    dataViewConfigs: dataViewConfigs,
    tools: _tools
  };
  // app
  _app = new dwv.App();
  _app.init(config);

  // bind events
  _app.addEventListener('error', function (event) {
    console.error('load error', event);
  });
  _app.addEventListener('loadstart', function (event) {
    console.time('load-data-' + event.loadid);
  });
  var dataLoadProgress = new Array(numberOfDataToLoad);
  var sumReducer = function (sum, value) {
    return sum + value;
  };
  _app.addEventListener('loadprogress', function (event) {
    if (typeof event.lengthComputable !== 'undefined' &&
      event.lengthComputable) {
      dataLoadProgress[event.loadid] =
        Math.ceil((event.loaded / event.total) * 100);
      document.getElementById('loadprogress').value =
        dataLoadProgress.reduce(sumReducer) / numberOfDataToLoad;
    }
  });
  _app.addEventListener('load', function (event) {
    if (!viewOnFirstLoadItem) {
      _app.render(event.loadid);
    }
  });
  _app.addEventListener('loadend', function (event) {
    console.timeEnd('load-data-' + event.loadid);
  });

  var dataLoad = 0;
  var firstRender = [];
  _app.addEventListener('loadend', function (event) {
    // update UI at first render
    if (!firstRender.includes(event.loadid)) {
      // store data id
      firstRender.push(event.dataid);
      // log meta data
      if (event.loadtype === 'image') {
        console.log('metadata', _app.getMetaData(event.loadid));
        // add data row
        addDataRow(event.loadid);
        ++dataLoad;
        // init gui
        if (dataLoad === numberOfDataToLoad) {
          // select tool
          _app.setTool(getSelectedTool());

          var changeLayoutSelect = document.getElementById('changelayout');
          changeLayoutSelect.disabled = false;
          var resetLayoutButton = document.getElementById('resetlayout');
          resetLayoutButton.disabled = false;
        }
      }
    }

    if (event.loadtype === 'image' &&
      _app.getMetaData(event.loadid).Modality.value === 'SEG') {
      // log SEG details
      logFramePosPats(_app.getMetaData(event.loadid));

      // example usage of a dicom SEG as data mask
      var useSegAsMask = false;
      if (useSegAsMask) {
        // image to filter
        var imgDataIndex = 0;
        var vls = _app.getViewLayersByDataIndex(imgDataIndex);
        var vc = vls[0].getViewController();
        var img = _app.getImage(imgDataIndex);
        var imgGeometry = img.getGeometry();
        var sliceSize = imgGeometry.getSize().getDimSize(2);
        // SEG image
        var segImage = _app.getImage(event.loadid);
        // calculate slice difference
        var segOrigin0 = segImage.getGeometry().getOrigins()[0];
        var segOrigin0Point = new dwv.math.Point([
          segOrigin0.getX(), segOrigin0.getY(), segOrigin0.getZ()
        ]);
        var segOriginIndex = imgGeometry.worldToIndex(segOrigin0Point);
        var indexOffset = segOriginIndex.get(2) * sliceSize;
        // set alpha function
        vc.setViewAlphaFunction(function (value, index) {
          // multiply by 3 since SEG is RGB
          var segIndex = 3 * (index - indexOffset);
          if (segIndex >= 0 &&
            segImage.getValueAtOffset(segIndex) === 0 &&
            segImage.getValueAtOffset(segIndex + 1) === 0 &&
            segImage.getValueAtOffset(segIndex + 2) === 0) {
            return 0;
          } else {
            return 0xff;
          }
        });
      }
    }
  });

  _app.addEventListener('positionchange', function (event) {
    var input = document.getElementById('position');
    var values = event.value[1];
    var text = '(index: ' + event.value[0] + ')';
    if (event.value.length > 2) {
      text += ' value: ' + event.value[2];
    }
    input.value = values.map(getPrecisionRound(2));
    // index as small text
    var span = document.getElementById('positionspan');
    span.innerHTML = text;
  });

  // default keyboard shortcuts
  _app.addEventListener('keydown', function (event) {
    _app.defaultOnKeydown(event);
    // mask segment related
    if (!isNaN(parseInt(event.key, 10))) {
      var vc =
        _app.getActiveLayerGroup().getActiveViewLayer().getViewController();
      if (!vc.isMask()) {
        return;
      }
      var number = parseInt(event.key, 10);
      var segHelper = vc.getMaskSegmentHelper();
      if (segHelper.hasSegment(number)) {
        var segment = segHelper.getSegment(number);
        if (event.ctrlKey) {
          if (event.altKey) {
            dwv.logger.debug('Delete segment: ' + segment.label);
            // delete
            vc.deleteSegment(number, _app.addToUndoStack);
          } else {
            dwv.logger.debug('Show/hide segment: ' + segment.label);
            // show/hide the selected segment
            if (segHelper.isHidden(number)) {
              segHelper.removeFromHidden(number);
            } else {
              segHelper.addToHidden(number);
            }
            vc.applyHiddenSegments();
          }
        }
      }
    }
  });
  // default on resize
  window.addEventListener('resize', function () {
    _app.onResize();
  });

  var options = {};
  // special dicom web request header
  if (_dicomWeb) {
    options.requestHeaders = [{
      name: 'Accept',
      value: 'multipart/related; type="application/dicom"; transfer-syntax=*'
    }];
  }
  // load from window location
  dwv.utils.loadFromUri(window.location.href, _app, options);
};

/**
 * Last minute.
 */
dwv.test.onDOMContentLoadedViewer = function () {
  // setup
  dwv.test.viewerSetup();

  var positionInput = document.getElementById('position');
  positionInput.addEventListener('change', function () {
    var vls = _app.getViewLayersByDataIndex(0);
    var vc = vls[0].getViewController();
    var values = this.value.split(',');
    vc.setCurrentPosition(new dwv.math.Point3D(
      parseFloat(values[0]), parseFloat(values[1]), parseFloat(values[2]))
    );
  });

  var resetLayoutButton = document.getElementById('resetlayout');
  resetLayoutButton.addEventListener('click', function () {
    _app.resetLayout();
  });

  var changeLayoutSelect = document.getElementById('changelayout');
  changeLayoutSelect.addEventListener('change', function (event) {
    var configs;
    var value = event.target.value;
    if (value === 'mpr') {
      configs = prepareAndGetMPRDataViewConfig();
    } else {
      configs = prepareAndGetSimpleDataViewConfig();
    }

    // unbind app to controls
    unbindAppToControls();

    // set config
    _app.setDataViewConfig(configs);

    clearDataTable();
    for (var i = 0; i < _app.getNumberOfLoadedData(); ++i) {
      _app.render(i);
      // add data row (will bind controls)
      addDataRow(i);
    }

    // need to set tool after config change
    _app.setTool(getSelectedTool());
  });

  setupBindersCheckboxes();

  setupToolsCheckboxes();

  // bind app to input files
  var fileinput = document.getElementById('fileinput');
  fileinput.addEventListener('change', function (event) {
    console.log('%c ----------------', 'color: teal;');
    console.log(event.target.files);
    _app.loadFiles(event.target.files);
  });
};

/**
 * Append a layer div in the root 'dwv' one.
 *
 * @param {string} id The id of the layer.
 */
function addLayerGroup(id) {
  var layerDiv = document.createElement('div');
  layerDiv.id = id;
  layerDiv.className = 'layerGroup';
  var root = document.getElementById('dwv');
  root.appendChild(layerDiv);
}

/**
 * Create simple view config(s).
 *
 * @returns {object} The view config.
 */
function prepareAndGetSimpleDataViewConfig() {
  // clean up
  var dwvDiv = document.getElementById('dwv');
  dwvDiv.innerHTML = '';
  // add div
  addLayerGroup('layerGroupA');
  return {'*': [{divId: 'layerGroupA'}]};
}

/**
 * Create MPR view config(s).
 *
 * @returns {object} The view config.
 */
function prepareAndGetMPRDataViewConfig() {
  // clean up
  var dwvDiv = document.getElementById('dwv');
  dwvDiv.innerHTML = '';
  // add divs
  addLayerGroup('layerGroupA');
  addLayerGroup('layerGroupC');
  addLayerGroup('layerGroupS');
  return {
    '*': [
      {
        divId: 'layerGroupA',
        orientation: 'axial'
      },
      {
        divId: 'layerGroupC',
        orientation: 'coronal'
      },
      {
        divId: 'layerGroupS',
        orientation: 'sagittal'
      }
    ]
  };
}

/**
 * Get the layer groups div ids from the data view configs.
 *
 * @param {object} dataViewConfigs The configs.
 * @returns {Array} The list of ids.
 */
function getLayerGroupDivIds(dataViewConfigs) {
  var divIds = [];
  var keys = Object.keys(dataViewConfigs);
  for (var i = 0; i < keys.length; ++i) {
    var dataViewConfig = dataViewConfigs[keys[i]];
    for (var j = 0; j < dataViewConfig.length; ++j) {
      var divId = dataViewConfig[j].divId;
      if (!divIds.includes(divId)) {
        divIds.push(divId);
      }
    }
  }
  return divIds;
}

/**
 * Get the layer group ids associated to a data.
 *
 * @param {Array} dataViewConfig The data view config.
 * @returns {Array} The list of ids.
 */
function getDataLayerGroupIds(dataViewConfig) {
  var divIds = [];
  for (var j = 0; j < dataViewConfig.length; ++j) {
    divIds.push(dataViewConfig[j].divId);
  }
  return divIds;
}

/**
 * Setup the binders checkboxes
 */
function setupBindersCheckboxes() {
  var bindersDiv = document.getElementById('binders');
  var propList = [
    'WindowLevel',
    'Position',
    'Zoom',
    'Offset',
    'Opacity'
  ];
  var binders = [];
  // add all binders at startup
  for (var b = 0; b < propList.length; ++b) {
    binders.push(new dwv.gui[propList[b] + 'Binder']);
  }
  _app.setLayerGroupsBinders(binders);

  /**
   * Add a binder.
   *
   * @param {string} propName The name of the property to bind.
   */
  function addBinder(propName) {
    binders.push(new dwv.gui[propName + 'Binder']);
    _app.setLayerGroupsBinders(binders);
  }
  /**
   * Remove a binder.
   *
   * @param {string} propName The name of the property to bind.
   */
  function removeBinder(propName) {
    for (var i = 0; i < binders.length; ++i) {
      if (binders[i] instanceof dwv.gui[propName + 'Binder']) {
        binders.splice(i, 1);
      }
    }
    _app.setLayerGroupsBinders(binders);
  }
  /**
   * Get the input change handler for a binder.
   *
   * @param {string} propName The name of the property to bind.
   * @returns {object} The handler.
   */
  function getOnInputChange(propName) {
    return function (event) {
      if (event.target.checked) {
        addBinder(propName);
      } else {
        removeBinder(propName);
      }
    };
  }
  // individual binders
  for (var i = 0; i < propList.length; ++i) {
    var propName = propList[i];

    var input = document.createElement('input');
    input.id = 'binder-' + i;
    input.type = 'checkbox';
    input.checked = true;
    input.onchange = getOnInputChange(propName);

    var label = document.createElement('label');
    label.htmlFor = input.id;
    label.appendChild(document.createTextNode(propName));

    bindersDiv.appendChild(input);
    bindersDiv.appendChild(label);
  }

  // check all
  var allInput = document.createElement('input');
  allInput.id = 'binder-all';
  allInput.type = 'checkbox';
  allInput.checked = true;
  allInput.onchange = function () {
    for (var j = 0; j < propList.length; ++j) {
      document.getElementById('binder-' + j).click();
    }
  };
  var allLabel = document.createElement('label');
  allLabel.htmlFor = allInput.id;
  allLabel.appendChild(document.createTextNode('all'));
  bindersDiv.appendChild(allInput);
  bindersDiv.appendChild(allLabel);
}

/**
 * Setup the tools checkboxes
 */
function setupToolsCheckboxes() {
  var toolsDiv = document.getElementById('tools');
  var keys = Object.keys(_tools);

  var getChangeTool = function (tool) {
    return function () {
      _app.setTool(tool);
      if (tool === 'Draw') {
        _app.setToolFeatures({shapeName: 'Rectangle'});
      }
    };
  };

  var getKeyCheck = function (char, input) {
    return function (event) {
      if (!event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        event.key === char) {
        input.click();
      }
    };
  };

  for (var i = 0; i < keys.length; ++i) {
    var key = keys[i];

    var input = document.createElement('input');
    input.id = 'tool-' + i;
    input.name = 'tools';
    input.type = 'radio';
    input.onchange = getChangeTool(key);

    if (key === 'Scroll') {
      input.checked = true;
    }

    var label = document.createElement('label');
    label.htmlFor = input.id;
    label.appendChild(document.createTextNode(key));

    toolsDiv.appendChild(input);
    toolsDiv.appendChild(label);

    // keyboard shortcut
    window.addEventListener('keydown', getKeyCheck(key[0].toLowerCase(), input));
  }
}

/**
 * Get the selected tool
 *
 * @returns {string} The tool name.
 */
function getSelectedTool() {
  var toolsInput = document.getElementsByName('tools');
  var toolIndex = null;
  for (var j = 0; j < toolsInput.length; ++j) {
    if (toolsInput[j].checked) {
      toolIndex = j;
      break;
    }
  }
  return Object.keys(_tools)[toolIndex];
}

/**
 * Bind app to controls.
 */
function bindAppToControls() {
  _app.addEventListener('wlchange', onWLChange);
  _app.addEventListener('opacitychange', onOpacityChange);
}

/**
 * Unbind app to controls.
 */
function unbindAppToControls() {
  _app.removeEventListener('wlchange', onWLChange);
  _app.removeEventListener('opacitychange', onOpacityChange);
}

/**
 * Handle app wl change.
 *
 * @param {object} event The change event.
 */
function onWLChange(event) {
  // width number
  var elemId = 'width-' + event.dataid + '-number';
  var elem = document.getElementById(elemId);
  if (elem) {
    elem.value = event.value[1];
  } else {
    console.warn('wl change: HTML not ready?');
  }
  // width range
  elemId = 'width-' + event.dataid + '-range';
  elem = document.getElementById(elemId);
  if (elem) {
    elem.value = event.value[1];
  }
  // center number
  elemId = 'center-' + event.dataid + '-number';
  elem = document.getElementById(elemId);
  if (elem) {
    elem.value = event.value[0];
  }
  // center range
  elemId = 'center-' + event.dataid + '-range';
  elem = document.getElementById(elemId);
  if (elem) {
    elem.value = event.value[0];
  }
}

/**
 * Handle app opacity change.
 *
 * @param {object} event The change event.
 */
function onOpacityChange(event) {
  var value = parseFloat(event.value[0]).toPrecision(3);
  // number
  var elemId = 'opacity-' + event.dataid + '-number';
  var elem = document.getElementById(elemId);
  if (elem) {
    elem.value = value;
  } else {
    console.warn('opacity change: HTML not ready?');
  }
  // range
  elemId = 'opacity-' + event.dataid + '-range';
  elem = document.getElementById(elemId);
  if (elem) {
    elem.value = value;
  }
}

/**
 * Clear the data table.
 */
function clearDataTable() {
  var detailsDiv = document.getElementById('layersdetails');
  detailsDiv.innerHTML = '';
}

/**
 * Get a control div: label, range and number field.
 *
 * @param {string} id The control id.
 * @param {string} name The control name.
 * @param {number} min The control minimum value.
 * @param {number} max The control maximum value.
 * @param {number} value The control value.
 * @param {Function} callback The callback on control value change.
 * @param {number} precision Optional number field float precision.
 * @returns {object} The control div.
 */
function getControlDiv(id, name, min, max, value, callback, precision) {
  var range = document.createElement('input');
  range.id = id + '-range';
  range.className = 'ctrl-range';
  range.type = 'range';
  range.min = min.toPrecision(precision);
  range.max = max.toPrecision(precision);
  range.step = ((max - min) * 0.01).toPrecision(precision);
  range.value = value;

  var label = document.createElement('label');
  label.id = id + '-label';
  label.className = 'ctrl-label';
  label.htmlFor = range.id;
  label.appendChild(document.createTextNode(name));

  var number = document.createElement('input');
  number.id = id + '-number';
  number.className = 'ctrl-number';
  number.type = 'number';
  number.min = range.min;
  number.max = range.max;
  number.step = range.step;
  number.value = parseFloat(value).toPrecision(precision);

  // callback and bind range and number
  number.oninput = function () {
    range.value = this.value;
    callback(this.value);
  };
  range.oninput = function () {
    number.value = parseFloat(this.value).toPrecision(precision);
    callback(this.value);
  };

  var div = document.createElement('div');
  div.id = id + '-ctrl';
  div.className = 'ctrl';
  div.appendChild(label);
  div.appendChild(range);
  div.appendChild(number);

  return div;
}

/**
 * Add a data row.
 *
 * @param {number} id The data index.
 */
function addDataRow(id) {
  // bind app to controls on first id
  if (id === 0) {
    bindAppToControls();
  }

  var dataViewConfigs = _app.getDataViewConfig();
  var allLayerGroupDivIds = getLayerGroupDivIds(dataViewConfigs);
  // use first view layer
  var vls = _app.getViewLayersByDataIndex(id);
  var vl = vls[0];
  var vc = vl.getViewController();
  var wl = vc.getWindowLevel();

  var table = document.getElementById('layerstable');
  var body;
  // create table if not present
  if (!table) {
    table = document.createElement('table');
    table.id = 'layerstable';
    var header = table.createTHead();
    var trow = header.insertRow(0);
    var insertTCell = function (text) {
      var th = document.createElement('th');
      th.innerHTML = text;
      trow.appendChild(th);
    };
    insertTCell('Id');
    for (var j = 0; j < allLayerGroupDivIds.length; ++j) {
      insertTCell('LG' + j);
    }
    insertTCell('Alpha Range');
    insertTCell('Contrast');
    insertTCell('Alpha');
    body = table.createTBody();
    var div = document.getElementById('layersdetails');
    div.appendChild(table);
  } else {
    body = table.getElementsByTagName('tbody')[0];
  }

  // add new layer row
  var row = body.insertRow();
  var cell;

  // cell: id
  cell = row.insertCell();
  cell.appendChild(document.createTextNode(id));

  // cell: radio
  var viewConfig = dataViewConfigs[id];
  if (typeof viewConfig === 'undefined') {
    viewConfig = dataViewConfigs['*'];
  }
  var dataLayerGroupsIds = getDataLayerGroupIds(viewConfig);
  for (var l = 0; l < allLayerGroupDivIds.length; ++l) {
    var layerGroupDivId = allLayerGroupDivIds[l];
    cell = row.insertCell();
    if (!dataLayerGroupsIds.includes(layerGroupDivId)) {
      continue;
    }
    var radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'layerselect-' + l;
    radio.id = 'layerselect-' + layerGroupDivId + '-' + id;
    radio.checked = true;
    radio.onchange = function (event) {
      var fullId = event.target.id;
      var split = fullId.split('-');
      var groupDivId = split[1];
      var dataId = split[2];
      var lg = _app.getLayerGroupByDivId(groupDivId);
      lg.setActiveViewLayerByDataIndex(parseInt(dataId, 10));
    };
    cell.appendChild(radio);
  }

  var image = _app.getImage(vl.getDataIndex());
  var dataRange = image.getDataRange();
  var rescaledDataRange = image.getRescaledDataRange();
  var floatPrecision = 4;

  // cell: alpha range
  cell = row.insertCell();
  var minId = 'value-min-' + id;
  var maxId = 'value-max-' + id;
  // callback
  var changeAlphaFunc = function () {
    var min = parseFloat(document.getElementById(minId + '-number').value);
    var max = parseFloat(document.getElementById(maxId + '-number').value);
    var func = function (value) {
      if (value >= min && value <= max) {
        return 255;
      }
      return 0;
    };
    for (var i = 0; i < vls.length; ++i) {
      vls[i].getViewController().setViewAlphaFunction(func);
    }
  };
  // add controls
  cell.appendChild(getControlDiv(minId, 'min',
    dataRange.min, dataRange.max, dataRange.min,
    changeAlphaFunc, floatPrecision));
  cell.appendChild(getControlDiv(maxId, 'max',
    dataRange.min, dataRange.max, dataRange.max,
    changeAlphaFunc, floatPrecision));

  // cell: contrast
  cell = row.insertCell();
  var widthId = 'width-' + id;
  var centerId = 'center-' + id;
  // callback
  var changeContrast = function () {
    var width =
      parseFloat(document.getElementById(widthId + '-number').value);
    var center =
      parseFloat(document.getElementById(centerId + '-number').value);
    vc.setWindowLevel(center, width);
  };
  // add controls
  cell.appendChild(getControlDiv(widthId, 'width',
    0, rescaledDataRange.max - rescaledDataRange.min, wl.width,
    changeContrast, floatPrecision));
  cell.appendChild(getControlDiv(centerId, 'center',
    rescaledDataRange.min, rescaledDataRange.max, wl.center,
    changeContrast, floatPrecision));

  // cell: opactiy
  cell = row.insertCell();
  var opacityId = 'opacity-' + id;
  // callback
  var changeOpacity = function (value) {
    vl.setOpacity(value);
    vl.draw();
  };
  // add controls
  cell.appendChild(getControlDiv(opacityId, 'opacity',
    0, 1, vl.getOpacity(), changeOpacity, floatPrecision));
}

/**
 * Compare two pos pat keys.
 *
 * @param {string} a The key of the first item.
 * @param {string} b The key of the second item.
 * @returns {number} Negative if a<b, positive if a>b.
 */
function comparePosPat(a, b) {
  var za = parseFloat(a.split('\\').at(-1));
  var zb = parseFloat(b.split('\\').at(-1));
  return za - zb;
}

/**
 * Sort an object with pos pat string keys.
 *
 * @param {object} obj The object to sort
 * @returns {object} The sorted object.
 */
function sortByPosPatKey(obj) {
  var keys = Object.keys(obj);
  keys.sort(comparePosPat);
  var sorted = new Map();
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    sorted.set(key, obj[key]);
  }
  return sorted;
}

/**
 * Get a rounding function for a specific precision.
 *
 * @param {number} precision The rounding precision.
 * @returns {Function} The rounding function.
 */
function getPrecisionRound(precision) {
  return function (x) {
    return dwv.utils.precisionRound(x, precision);
  };
}

/**
 * Log the DICCOM seg segments ordered by frame position patients.
 *
 * @param {object} elements The DICOM seg elements.
 */
function logFramePosPats(elements) {
  var perFrame = elements.PerFrameFunctionalGroupsSequence.value;
  var perPos = {};
  for (var i = 0; i < perFrame.length; ++i) {
    var posSq = perFrame[i].PlanePositionSequence.value;
    var pos = posSq[0].ImagePositionPatient.value;
    if (typeof perPos[pos] === 'undefined') {
      perPos[pos] = [];
    }
    var frameSq = perFrame[i].FrameContentSequence.value;
    var dim = frameSq[0].DimensionIndexValues.value;
    perPos[pos].push(dim);
  }
  console.log('DICOM SEG Segments', sortByPosPatKey(perPos));
}
