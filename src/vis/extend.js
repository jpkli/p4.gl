export default function ($p, vmap, viewIndex) {
  let chart = $p.views[viewIndex];
  let width = chart.width;
  let height = chart.height;
  let padding = chart.padding;

  $p.extensions.forEach((ext) => {
    if (ext.condition.call(null, vmap)) {
      $p.skipRender = ext.skipDefault;
      let data = {
        json: null,
        array: null,
        texture: null,
        vmap: vmap,
        fields: $p.fields
      };

      let view = Object.assign({}, chart);
      view.width = width - padding.left - padding.right,
        view.height = height - padding.top - padding.bottom,
        view.encodings = vmap,
        view.svg = chart.chart.svg.svg,
        view.canvas = $p.canvas

      if (ext.exportData) {
        data.json = $p.exportResult('row');
      }

      if (typeof ext.onready === 'function') {
        ext.onready.call($p, data, view);
      }

      let execution = (ext.type == 'class') ?
        function (data, view) {
          return new ext.function(data, view)
        } :
        ext.function;

      if (ext.restartOnUpdate) {
        execution.call(ext, data, view);
      } else {
        if (!$p._update) {
          execution.call(ext, data, view);
        }
      }
    }
  })
}