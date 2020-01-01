var domtoimage = require('dom-to-image');
var fileSaver = require('file-saver');
var jsPDF = require('jspdf');

L.Control.EasyPrint = L.Control.extend({
  options: {
    title: 'Print map',
    position: 'topleft',
    sizeModes: ['Current'],
    filename: 'map',
    exportOnly: false,
    hidden: false,
    tileWait: 500,
    hideControlContainer: true,
    hideClasses: [],
    customWindowTitle: window.document.title,
    defaultSizeTitles: {
      Current: 'Current Size',
      A4Landscape: 'A4 Landscape',
      A4Portrait: 'A4 Portrait'
    }
  },

  onAdd: function () { 
    this.mapContainer = this._map.getContainer();
    this.options.sizeModes = this.options.sizeModes.map(function (sizeMode) {
      if (sizeMode === 'Current') {
        return {
          name: this.options.defaultSizeTitles.Current,
          className: 'CurrentSize'
        }
      }
      if (sizeMode === 'A4Landscape') {
        return {
          height: this._a4PageSize.height,
          width: this._a4PageSize.width,
          name: this.options.defaultSizeTitles.A4Landscape,
          className: 'A4Landscape page'
        }
      }
      if (sizeMode === 'A4Portrait') {
        return {
          height: this._a4PageSize.width,
          width: this._a4PageSize.height,
          name: this.options.defaultSizeTitles.A4Portrait,
          className: 'A4Portrait page'
        }
      };
      return sizeMode;
    }, this);
    
    var container = L.DomUtil.create('div', 'leaflet-control-easyPrint leaflet-bar leaflet-control');
    var wrapper = L.DomUtil.create('div', 'leaflet-control-easyPrint-wrapper', container);
    if (!this.options.hidden) {

      L.DomEvent.addListener(container, 'click', this._togglePageSizeButtons, this);

      var btnClass = 'leaflet-control-easyPrint-button'
      if (this.options.exportOnly) btnClass = btnClass + '-export'

      this.link = L.DomUtil.create('a', btnClass, wrapper);
      this.link.id = "leafletEasyPrint";
      this.link.title = this.options.title;
      this.holder = L.DomUtil.create('ul', 'easyPrintHolder', container);

      this.options.sizeModes.forEach(function (sizeMode) {
        var btn = L.DomUtil.create('li', 'easyPrintSizeMode', this.holder);
        btn.title = sizeMode.name;
        var link = L.DomUtil.create('a', sizeMode.className, btn);
        L.DomEvent.addListener(btn, 'click', this.printMap, this);
      }, this);

      L.DomEvent.disableClickPropagation(container);
    }
    return container;
  },

  printMap: function (event, filename) {
    if (filename) {
      this.options.filename = filename
    }
    if (!this.options.exportOnly) {
      this._page = window.open("", "_blank", 'toolbar=no,status=no,menubar=no,scrollbars=no,resizable=no,left=10, top=10, width=200, height=250, visible=none');
    }
    this.originalState = {
      mapWidth: this.mapContainer.style.width,
      widthWasAuto: false,
      widthWasPercentage: false,
      mapHeight: this.mapContainer.style.height,
      zoom: this._map.getZoom(),
      center: this._map.getCenter()
    };
    if (this.originalState.mapWidth === 'auto') {
      this.originalState.mapWidth = this._map.getSize().x  + 'px'
      this.originalState.widthWasAuto = true
    } else if (this.originalState.mapWidth.includes('%')) {
      this.originalState.percentageWidth = this.originalState.mapWidth
      this.originalState.widthWasPercentage = true
      this.originalState.mapWidth = this._map.getSize().x  + 'px'
    }
    this._map.fire("easyPrint-start", { event: event });
    if (!this.options.hidden) {
      this._togglePageSizeButtons({type: null});
    }
    if (this.options.hideControlContainer) {
      this._toggleControls();    
    }
    if (this.options.hideClasses) {
      this._toggleClasses(this.options.hideClasses);
    }
    var sizeMode = typeof event !== 'string' ? event.target.className : event;
    if (sizeMode === 'CurrentSize') {
      return this._printOpertion(sizeMode);
    }
    this.outerContainer = this._createOuterContainer(this.mapContainer)
    if (this.originalState.widthWasAuto) {
      this.outerContainer.style.width = this.originalState.mapWidth
    }
    this._createImagePlaceholder(sizeMode)
  },

  _createImagePlaceholder: function (sizeMode) {
    var plugin = this;
    domtoimage.toPng(this.mapContainer, {
        width: parseInt(this.originalState.mapWidth.replace('px')),
        height: parseInt(this.originalState.mapHeight.replace('px'))
      })
      .then(function (dataUrl) {
        plugin.blankDiv = document.createElement("div");
        var blankDiv = plugin.blankDiv;
        plugin.outerContainer.parentElement.insertBefore(blankDiv, plugin.outerContainer);
        blankDiv.className = 'epHolder';
        blankDiv.style.backgroundImage = 'url("' + dataUrl + '")';
        blankDiv.style.position = 'absolute';
        blankDiv.style.zIndex = 1011;
        blankDiv.style.display = 'initial';
        blankDiv.style.width = plugin.originalState.mapWidth;
        blankDiv.style.height = plugin.originalState.mapHeight;
        plugin._resizeAndPrintMap(sizeMode);
      })
      .catch(function (error) {
          console.error('oops, something went wrong!', error);
      });
  },

  _resizeAndPrintMap: function (sizeMode) {
    this.outerContainer.style.opacity = 0;
    var pageSize = this.options.sizeModes.filter(function (item) {
      return item.className.indexOf(sizeMode) > -1;
    });
    pageSize = pageSize[0]
    this.mapContainer.style.width = pageSize.width + 'px';
    this.mapContainer.style.height = pageSize.height + 'px';
    if (this.mapContainer.style.width > this.mapContainer.style.height) {
      this.orientation = 'portrait';
    } else {
      this.orientation = 'landscape';
    }
    this._map.setView(this.originalState.center);
    this._map.setZoom(this.originalState.zoom);
    this._map.invalidateSize();
    if (this.options.tileLayer) {
      this._pausePrint(sizeMode)
    } else {
      this._printOpertion(sizeMode)
    }
  },

  _pausePrint: function (sizeMode) {
    var plugin = this
    var loadingTest = setInterval(function () { 
      if(!plugin.options.tileLayer.isLoading()) {
        clearInterval(loadingTest);
        plugin._printOpertion(sizeMode)
      }
    }, plugin.options.tileWait);
  },

  _printOpertion: function (sizemode) {
    var plugin = this;
    var widthForExport = this.mapContainer.style.width
    if (this.originalState.widthWasAuto && sizemode === 'CurrentSize' || this.originalState.widthWasPercentage && sizemode === 'CurrentSize') {
      widthForExport = this.originalState.mapWidth
    }
    domtoimage.toPng(plugin.mapContainer, {
        width: parseInt(widthForExport),
        height: parseInt(plugin.mapContainer.style.height.replace('px'))
      })
      .then(function (dataUrl) {
          var doc = new jsPDF();
          doc.addImage(dataUrl,'PNG', 20, 20);  
          if (plugin.options.exportOnly) {
			doc.save(plugin.options.filename + '.pdf');
          } else {
            plugin._sendToBrowserPrint(dataUrl, plugin.orientation);
          }
          plugin._toggleControls(true);
          plugin._toggleClasses(plugin.options.hideClasses, true);

          if (plugin.outerContainer) {
            if (plugin.originalState.widthWasAuto) {
              plugin.mapContainer.style.width = 'auto'
            } else if (plugin.originalState.widthWasPercentage) {
              plugin.mapContainer.style.width = plugin.originalState.percentageWidth
            }
            else {
              plugin.mapContainer.style.width = plugin.originalState.mapWidth;              
            }
            plugin.mapContainer.style.height = plugin.originalState.mapHeight;
            plugin._removeOuterContainer(plugin.mapContainer, plugin.outerContainer, plugin.blankDiv)
            plugin._map.invalidateSize();
            plugin._map.setView(plugin.originalState.center);
            plugin._map.setZoom(plugin.originalState.zoom);
          }
          plugin._map.fire("easyPrint-finished");
      })
      .catch(function (error) {
          console.error('Print operation failed', error);
      }); 
  },

  _sendToBrowserPrint: function (img, orientation) {
    this._page.resizeTo(600, 800); 
    var pageContent = this._createNewWindow(img, orientation, this)
    this._page.document.body.innerHTML = ''
    this._page.document.write(pageContent);
    this._page.document.close();  
  },

  _createNewWindow: function (img, orientation, plugin) {
    return '<html><head>' 
		 + '<style>@media print {'
         + 'img { max-width: 98%!important; max-height: 98%!important; }'
          +'@page { size: ' + orientation + ';}}'
        +'</style>'
        +'<script>function step1(){'
        +'setTimeout('+step2()+', 10);}'
        +'function step2(){window.print();window.close()}'
        +'</script></head><body onload='+step1()+'>'
        +'<img src=' + img + ' style="display:block; margin:auto;"></body></html>';
  },

  _createOuterContainer: function (mapDiv) {
    var outerContainer = document.createElement('div'); 
    mapDiv.parentNode.insertBefore(outerContainer, mapDiv); 
    mapDiv.parentNode.removeChild(mapDiv);
    outerContainer.appendChild(mapDiv);
    outerContainer.style.width = mapDiv.style.width;
    outerContainer.style.height = mapDiv.style.height;
    outerContainer.style.display = 'inline-block'
    outerContainer.style.overflow = 'hidden';
    return outerContainer;
  },

  _removeOuterContainer: function (mapDiv, outerContainer, blankDiv) {
    if (outerContainer.parentNode) {
      outerContainer.parentNode.insertBefore(mapDiv, outerContainer);
      outerContainer.parentNode.removeChild(blankDiv);
      outerContainer.parentNode.removeChild(outerContainer);      
    }
  },

  _dataURItoBlob: function (dataURI) {
    var byteString = atob(dataURI.split(',')[1]);
    var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    var ab = new ArrayBuffer(byteString.length);
    var dw = new DataView(ab);
    for(var i = 0; i < byteString.length; i++) {
        dw.setUint8(i, byteString.charCodeAt(i));
    }
    return new Blob([ab], {type: mimeString});
  },

  _togglePageSizeButtons: function (e) {
    var holderStyle = this.holder.style
    var linkStyle = this.link.style
    if (e.type === 'click' && holderStyle.display != 'block') {
      holderStyle.display = 'block';
      linkStyle.borderTopRightRadius = '0'
      linkStyle.borderBottomRightRadius = '0'
    } else {
      holderStyle.display = 'none';
      linkStyle.borderTopRightRadius = '2px'
      linkStyle.borderBottomRightRadius = '2px'      
    }
  },

  _toggleControls: function (show) {
    var controlContainer = document.getElementsByClassName("leaflet-control-container")[0];
    if (show) return controlContainer.style.display = 'block';
    controlContainer.style.display = 'none';
  },
  _toggleClasses: function (classes, show) {
    classes.forEach(function (className) {
      var div = document.getElementsByClassName(className)[0];
      if (show) return div.style.display = 'block';
      div.style.display = 'none';
    });
  },

  _a4PageSize: {
    height: 715,
    width: 1045
  }

});

L.easyPrint = function(options) {
  return new L.Control.EasyPrint(options);
};
