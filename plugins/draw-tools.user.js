// ==UserScript==
// @id             iitc-plugin-draw-tools@breunigs
// @name           IITC plugin: draw tools
// @category       Layer
// @version        0.5.3.@@DATETIMEVERSION@@
// @namespace      https://github.com/jonatkins/ingress-intel-total-conversion
// @updateURL      @@UPDATEURL@@
// @downloadURL    @@DOWNLOADURL@@
// @description    [@@BUILDNAME@@-@@BUILDDATE@@] Allow drawing things onto the current map so you may plan your next move.
// @include        https://www.ingress.com/intel*
// @include        http://www.ingress.com/intel*
// @match          https://www.ingress.com/intel*
// @match          http://www.ingress.com/intel*
// @grant          none
// ==/UserScript==

@@PLUGINSTART@@

// PLUGIN START ////////////////////////////////////////////////////////


// use own namespace for plugin
window.plugin.drawTools = function() {};

window.plugin.drawTools.loadExternals = function() {
  try { console.log('Loading leaflet.draw JS now'); } catch(e) {}
  @@INCLUDERAW:external/leaflet.draw.js@@
  try { console.log('done loading leaflet.draw JS'); } catch(e) {}
  
  try { console.log('Loading save/load extension to leaflet.draw JS now'); } catch(e) {}

  L.SaveToolbar = L.Toolbar.extend({
    options: {
      save: {}
    },

    initialize: function (options) {
      // Need to set this manually since null is an acceptable value here
      if (options.save) {
        options.save = L.extend({}, this.options.save, options.save);
      }

      this._downloadLink = null;
      this._fileInput = null;

      L.Toolbar.prototype.initialize.call(this, options);
    },

    addToolbar: function (map) {
      var container = L.DomUtil.create('div', 'leaflet-draw-section'),
        buttonIndex = 0,
        buttonClassPrefix = 'leaflet-draw-edit';

      // Create an invisible file input 
      var fileInput = L.DomUtil.create('input', 'hidden', container);
      fileInput.type = 'file';
      fileInput.accept = '.drawn';
      fileInput.style.display = 'none';
      // Load on file change
      var that = this;
      fileInput.addEventListener("change", function (e) {
        that._loadFile(this.files[0]);
      }, false);
      this._fileInput = fileInput;

      this._toolbarContainer = L.DomUtil.create('div', 'leaflet-draw-toolbar leaflet-bar');

      this._map = map;

      if (this.options.save) {
        this._initModeHandler(
          new L.SaveToolbar.Save(map, {toolbar: this}),
          this._toolbarContainer,
          buttonIndex++,
          buttonClassPrefix,
          'Save drawn items'
        );
      }

      // Save button index of the last button, -1 as we would have ++ after the last button
      this._lastButtonIndex = --buttonIndex;

      // Create the actions part of the toolbar
      this._actionsContainer = this._createActions([
        {
          title: 'Save drawn items',
          text: 'Save',
          callback: this.disable,
          context: this
        },
        {
          title: 'Load drawn items',
          text: 'Load',
          callback: this._load,
          context: this
        },
        {
          title: 'Cancel',
          text: 'Cancel',
          callback: this.disable,
          context: this
        }
      ]);

      this._downloadLink = this._actionButtons[0].button;
      
      // reenable default actions on click to make downloading work
      L.DomEvent
        .off(this._downloadLink, 'click', L.DomEvent.stopPropagation)
        .off(this._downloadLink, 'mousedown', L.DomEvent.stopPropagation)
        .off(this._downloadLink, 'dblclick', L.DomEvent.stopPropagation)
        .off(this._downloadLink, 'click', L.DomEvent.preventDefault);


      // Add draw and cancel containers to the control container
      container.appendChild(this._toolbarContainer);
      container.appendChild(this._actionsContainer);

      return container;
    },

    disable: function () {
      if (!this.enabled()) { return; }

      L.Toolbar.prototype.disable.call(this);
    },

    createDownloadLink: function () {
      var dataStr = localStorage['plugin-draw-tools-layer'];
      if (dataStr === undefined) {
        // TODO better error handling
        dataStr = "";
      }

      var bb = new Blob([dataStr], {type: 'text/plain'});

      this._downloadLink.download = "iitc.drawn";
      this._downloadLink.href = window.URL.createObjectURL(bb);

      this._downloadLink.dataset.downloadurl = ['text/plain', this._downloadLink.download, this._downloadLink.href].join(':');
    },

    _load: function () {
      this._fileInput.click();
      this._activeMode.handler.disable();
    },

    _loadFile: function (file /* File */) {
      // Check file extension
      var ext = file.name.split('.').pop();
      if (ext.toLowerCase() != 'drawn') {
        window.alert("Unsupported file type " + file.type + '(' + ext + ')');
        return;
      }
      // Read selected file using HTML5 File API
      var reader = new FileReader();
      var that = this;
      reader.onload = L.Util.bind(function (e) {
        that._addItems(e.target.result);
      }, this);
      reader.readAsText(file);
    },

    _addItems: function (items /* JSON string */) {
      items = JSON.parse(items);

      $.each(items, function(index,item) {
        var layer = null;
        switch(item.type) {
          case 'polyline':
            layer = L.geodesicPolyline(item.latLngs,window.plugin.drawTools.lineOptions);
            break;
          case 'polygon':
            layer = L.geodesicPolygon(item.latLngs,window.plugin.drawTools.polygonOptions);
            break;
          case 'circle':
            layer = L.geodesicCircle(item.latLng,item.radius,window.plugin.drawTools.polygonOptions);
            break;
          case 'marker':
            layer = L.marker(item.latLng,window.plugin.drawTools.markerOptions)
            break;
          default:
            console.warn('unknown layer type "'+item.type+'" when loading draw tools layer');
            break;
        }
        if (layer) {
          window.plugin.drawTools.drawnItems.addLayer(layer);
        }
      });
    }
  });

  L.SaveToolbar.Save = L.Handler.extend({
    statics: {
      TYPE: 'save' // not delete as delete is reserved in js
    },

    includes: L.Mixin.Events,

    initialize: function (map, options) {
      L.Handler.prototype.initialize.call(this, map);

      L.Util.setOptions(this, options);

      this._toolbar = options.toolbar;

      // Save the type so super can fire, need to do this as cannot do this.TYPE :(
      this.type = L.SaveToolbar.Save.TYPE;
    },

    enable: function () {
      if (this._enabled) { return; }

      L.Handler.prototype.enable.call(this);

      this.fire('enabled', { handler: this.type});
    },

    disable: function () {
      if (!this._enabled) { return; }

      L.Handler.prototype.disable.call(this);

      this.fire('disabled', { handler: this.type});
    },

    addHooks: function () {
      this._toolbar.createDownloadLink();
    },

    removeHooks: function () {
    },
  });

  L.Control.Draw.prototype.initialize__ = L.Control.Draw.prototype.initialize;

  L.Control.Draw.prototype.initialize = function (options) {
    this.initialize__(options);

    // Add toolbar for saving / loading drawn items
    var toolbar, id;
    toolbar = new L.SaveToolbar({});
    id = L.stamp(toolbar);
    this._toolbars[id] = toolbar;

    // Listen for when toolbar is enabled
    this._toolbars[id].on('enable', this._toolbarEnabled, this);
  }

  try { console.log('done loading save/load extension to leaflet.draw JS'); } catch(e) {}


  window.plugin.drawTools.boot();

  $('head').append('<style>@@INCLUDESTRING:external/leaflet.draw.css@@</style>');
  
  $('head').append('<style>\n.leaflet-draw-actions .leaflet-color-picker > span {\nposition: absolute;\n}\n.leaflet-draw-actions .leaflet-color-picker span a {\npadding: 4px;\nline-height: 17px;\nborder-radius: 0;\nheight: 19px;\nwidth: 19px;\n}\n.leaflet-draw-actions .leaflet-color-picker span a span {\nborder: 1px solid #aaaaaa;\ndisplay: block;\nwidth: 17px;\nborder-radius: 3px;\n}\n.leaflet-draw-actions .leaflet-color-picker span a:first-child {\nborder-radius: 4px 4px 0 0;\n}\n.leaflet-draw-actions .leaflet-color-picker span a:last-child {\nborder-radius: 0 0 4px 4px;\n}\n</style>\n');

}

window.plugin.drawTools.setOptions = function() {

  window.plugin.drawTools.lineOptions = {
    stroke: true,
    color: '#a24ac3',
    weight: 4,
    opacity: 0.5,
    fill: false,
    clickable: true
  };

  window.plugin.drawTools.polygonOptions = L.extend({}, window.plugin.drawTools.lineOptions, {
    fill: true,
    fillColor: null, // to use the same as 'color' for fill
    fillOpacity: 0.2
  });

  window.plugin.drawTools.editOptions = L.extend({}, window.plugin.drawTools.polygonOptions, {
    dashArray: [10,10]
  });

  window.plugin.drawTools.markerOptions = {
    icon: new L.Icon.Default(),
    zIndexOffset: 2000
  };

}


// renders the draw control buttons in the top left corner
window.plugin.drawTools.addDrawControl = function() {
  var drawControl = new L.Control.Draw({
    draw: {
      rectangle: false,
      polygon: {
        title: 'Add a polygon\n\n'
          + 'Click on the button, then click on the map to\n'
          + 'define the start of the polygon. Continue clicking\n'
          + 'to draw the line you want. Click the first or last\n'
          + 'point of the line (a small white rectangle) to\n'
          + 'finish. Double clicking also works.',
        shapeOptions: window.plugin.drawTools.polygonOptions,
        snapPoint: window.plugin.drawTools.getSnapLatLng,
      },

      polyline: {
        title: 'Add a (poly) line.\n\n'
          + 'Click on the button, then click on the map to\n'
          + 'define the start of the line. Continue clicking\n'
          + 'to draw the line you want. Click the <b>last</b>\n'
          + 'point of the line (a small white rectangle) to\n'
          + 'finish. Double clicking also works.',
        shapeOptions: window.plugin.drawTools.lineOptions,
        snapPoint: window.plugin.drawTools.getSnapLatLng,
      },

      circle: {
        title: 'Add a circle.\n\n'
          + 'Click on the button, then click-AND-HOLD on the\n'
          + 'map where the circle’s center should be. Move\n'
          + 'the mouse to control the radius. Release the mouse\n'
          + 'to finish.',
        shapeOptions: window.plugin.drawTools.polygonOptions,
        snapPoint: window.plugin.drawTools.getSnapLatLng,
      },

      marker: {
        title: 'Add a marker.\n\n'
          + 'Click on the button, then click on the map where\n'
          + 'you want the marker to appear.',
        shapeOptions: window.plugin.drawTools.markerOptions,
        snapPoint: window.plugin.drawTools.getSnapLatLng,
        repeatMode: true,
      },

    },

    edit: {
      featureGroup: window.plugin.drawTools.drawnItems,

      edit: {
        title: 'Edit drawn items',
        selectedPathOptions: window.plugin.drawTools.editOptions,
      },

      remove: {
        title: 'Delete drawn items'
      },

    },

  });

  map.addControl(drawControl);
//  plugin.drawTools.addCustomButtons();
}


// given a point it tries to find the most suitable portal to
// snap to. It takes the CircleMarker’s radius and weight into account.
// Will return null if nothing to snap to or a LatLng instance.
window.plugin.drawTools.getSnapLatLng = function(unsnappedLatLng) {
  var containerPoint = map.latLngToContainerPoint(unsnappedLatLng);
  var candidates = [];
  $.each(window.portals, function(guid, portal) {
    var ll = portal.getLatLng();
    var pp = map.latLngToContainerPoint(ll);
    var size = portal.options.weight + portal.options.radius;
    var dist = pp.distanceTo(containerPoint);
    if(dist > size) return true;
    candidates.push([dist, ll]);
  });

  if(candidates.length === 0) return unsnappedLatLng;
  candidates = candidates.sort(function(a, b) { return a[0]-b[0]; });
  return candidates[0][1];
}


window.plugin.drawTools.save = function() {
  var data = [];

  window.plugin.drawTools.drawnItems.eachLayer( function(layer) {
    var item = {};
    if (layer instanceof L.GeodesicCircle || layer instanceof L.Circle) {
      item.type = 'circle';
      item.latLng = layer.getLatLng();
      item.radius = layer.getRadius();
    } else if (layer instanceof L.GeodesicPolygon || layer instanceof L.Polygon) {
      item.type = 'polygon';
      item.latLngs = layer.getLatLngs();
    } else if (layer instanceof L.GeodesicPolyline || layer instanceof L.Polyline) {
      item.type = 'polyline';
      item.latLngs = layer.getLatLngs();
    } else if (layer instanceof L.Marker) {
      item.type = 'marker';
      item.latLng = layer.getLatLng();
    } else {
      console.warn('Unknown layer type when saving draw tools layer');
      return; //.eachLayer 'continue'
    }

    data.push(item);
  });

  localStorage['plugin-draw-tools-layer'] = JSON.stringify(data);

  console.log('draw-tools: saved to localStorage');
}

window.plugin.drawTools.load = function() {
  var dataStr = localStorage['plugin-draw-tools-layer'];
  if (dataStr === undefined) return;

  var data = JSON.parse(dataStr);
  $.each(data, function(index,item) {
    var layer = null;
    switch(item.type) {
      case 'polyline':
        layer = L.geodesicPolyline(item.latLngs,window.plugin.drawTools.lineOptions);
        break;
      case 'polygon':
        layer = L.geodesicPolygon(item.latLngs,window.plugin.drawTools.polygonOptions);
        break;
      case 'circle':
        layer = L.geodesicCircle(item.latLng,item.radius,window.plugin.drawTools.polygonOptions);
        break;
      case 'marker':
        layer = L.marker(item.latLng,window.plugin.drawTools.markerOptions)
        break;
      default:
        console.warn('unknown layer type "'+item.type+'" when loading draw tools layer');
        break;
    }
    if (layer) {
      window.plugin.drawTools.drawnItems.addLayer(layer);
    }

  });

}


window.plugin.drawTools.boot = function() {
  window.plugin.drawTools.setOptions();

  //create a leaflet FeatureGroup to hold drawn items
  window.plugin.drawTools.drawnItems = new L.FeatureGroup();

  //load any previously saved items
  plugin.drawTools.load();

  //add the draw control - this references the above FeatureGroup for editing purposes
  plugin.drawTools.addDrawControl();

  //start off hidden. if the layer is enabled, the below addLayerGroup will add it, triggering a 'show'
  $('.leaflet-draw-section').hide();


  //hide the draw tools when the 'drawn items' layer is off, show it when on
  map.on('layeradd', function(obj) {
    if(obj.layer === window.plugin.drawTools.drawnItems) {
      $('.leaflet-draw-section').show();
    }
  });
  map.on('layerremove', function(obj) {
    if(obj.layer === window.plugin.drawTools.drawnItems) {
      $('.leaflet-draw-section').hide();
    }
  });

  //add the layer
  window.addLayerGroup('Drawn Items', window.plugin.drawTools.drawnItems, true);


  //place created items into the specific layer
  map.on('draw:created', function(e) {
    var type=e.layerType;
    var layer=e.layer;
    window.plugin.drawTools.drawnItems.addLayer(layer);
    window.plugin.drawTools.save();
  });

  map.on('draw:deleted', function(e) {
    window.plugin.drawTools.save();
  });

  map.on('draw:edited', function(e) {
    window.plugin.drawTools.save();
  });


}


var setup =  window.plugin.drawTools.loadExternals;

// PLUGIN END //////////////////////////////////////////////////////////

@@PLUGINEND@@
