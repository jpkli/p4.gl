import colors from './color';
import reveal from './reveal';
import {encode, EncodingChannels} from './encode';
import extend from './extend';
import interpolate from './shaders/interpolate.gl'

import Layout from './layout';
import Instanced from './shaders/Instanced.gl'
import Polygon from './shaders/Polygon.gl'
import Interleaved from './shaders/Interleaved.gl'

const userActions = ['click', 'hover', 'brush', 'zoom', 'pan'];
const visMarks = ['dot', 'circle', 'line', 'rect'];

export default function visualize($p) {

    let colorManager = colors($p);
    let chartPadding = $p.padding || {left: 0, right: 0, top: 0, bottom: 0};
    let viewport = $p.viewport;

    let vis = new Layout({
        container: $p.container,
        width: viewport[0] + chartPadding.left + chartPadding.right,
        height: viewport[1] + chartPadding.top + chartPadding.bottom,
        canvas: $p.canvas,
        padding: chartPadding
    });
    
    $p.uniform('uVisualEncodings',  'int',   new Array(EncodingChannels.length).fill(-1))
        .uniform('uScaleExponents', 'float',   new Array(EncodingChannels.length).fill(1.0))
        .uniform('uViewDim',        'vec2',  $p.viewport)
        .uniform('uVisMark',        'int',   1)
        .uniform('uInterleaveX',    'int',   0)
        .uniform('uVisDomains',     'vec2',  $p.fieldDomains.map(d=>d.slice()))
        .uniform('uVisScale',       'vec2',  [1.0, 1.0])
        .uniform('uPosOffset',      'vec2',  [0.0, 0.0])
        .uniform('uFeatureCount',   'int',   0)
        .uniform('uMarkSize',       'float', 16.0)
        .uniform('uMarkSpace',      'vec2',  [0.1, 0.1])
        .uniform('uDefaultAlpha',   'float', 1.0)
        .uniform('uDefaultWidth',   'float', 1.0 / $p.viewport[0])
        .uniform('uDefaultHeight',  'float', 1.0 / $p.viewport[1])
        .uniform('uMaxRGBA',        'vec4',  [0, 0, 0, 0])
        .uniform('uDefaultColor',   'vec3',  [0.8, 0, 0])
        .uniform('uGeoProjection',   'int',  0)
        .uniform('uDropZeros',   'int',  0)
        .uniform('uColorMode',      'int',   1)
        .uniform('uIsXYCategorical','ivec2', [0, 0])
        .varying('vColorRGBA',      'vec4'   );

    let enhance = reveal($p);

    $p.framebuffer('offScreenFBO', 'float', $p.viewport);
    // $p.framebuffer('visStats', 'float', [1, 1]);
    // $p.framebuffer("visStats", "float", [$p.views.length, 1]);
    // $p.framebuffer.enableRead('offScreenFBO');
    $p.bindFramebuffer('offScreenFBO');
    $p.ctx.clearColor( 1.0, 1.0, 1.0, 0.0 );
    $p.ctx.clear( $p.ctx.COLOR_BUFFER_BIT | $p.ctx.DEPTH_BUFFER_BIT );
    $p.bindFramebuffer(null);
    $p.subroutine('visMap', 'float', interpolate.visMap);
    $p.subroutine('getEncodingByFieldId', 'float', interpolate.getEncodingByFieldId);
    
    let renderers = {
        instanced: new Instanced({context: $p, name: 'instanced'}),
        polygon: new Polygon({context: $p, name: 'polygon'}),
        interleave: new Interleaved({context: $p, name: 'interleave'})
    }

    return function(options) {
        $p.revealDensity = false;
        let renderer = 'instanced';
        let vmap = options.vmap || {};
        let mark = options.mark || vmap.mark || 'circle';
        let viewIndex = options.viewIndex;

        let visDomain = {};
        let visDimension = vmap.viewport || [$p.views[viewIndex].width, $p.views[viewIndex].height] || viewport;
        let width = visDimension[0];
        let height =  visDimension[1];
        let padding = vmap.padding || $p.views[viewIndex].padding || chartPadding;
        let offset = vmap.offset || $p.views[viewIndex].offset || [0, 0];
        let dimSetting = encode($p, vmap, colorManager);

        let pv = $p.views[viewIndex];
        let colorInfo = (typeof(vmap.colors) === 'object') ? vmap.colors : pv.color;
    
        let colorMode = 1;
        let colorMap;
        
        let viewSetting = {
            domain: visDomain,
            fields: $p.fields,
            vmap: vmap,
            // onclick: interaction,
            strLists: $p.strLists,
            padding: padding,
            left: offset[0],
            top:  offset[1],
            colors: colorManager.getColors(),
        };

        viewSetting = Object.assign(viewSetting, dimSetting);
        viewSetting = Object.assign(viewSetting, $p.views[viewIndex]);

        if(!$p._update){
            $p.fields.forEach(function(f, i){
                visDomain[f] = $p.fieldDomains[i].slice();
            });
            if(vmap.zero) {
                if($p.fields.indexOf(vmap.width) > -1) {
                    visDomain[vmap.width][0] = 0;
                }
                if($p.fields.indexOf(vmap.height) > -1) {
                    visDomain[vmap.height][0] = 0;
                }
                if($p.fields.indexOf(vmap.y) > -1) {
                    visDomain[vmap.y][0] = 0;
                }
            } 

            // pv.domains = Object.keys(visDomain).map(f=>visDomain[f]);
            if (!vmap.append) {
                pv.domains = visDomain;
            }
            // $p.uniform.uVisDomains.data = pv.domains;
            if((vmap.append !== true ) && pv.hasOwnProperty('chart')) {
                pv.chart.svg.remove();
                pv.chart.removeAxis();
            }
            // if (!pv.hasOwnProperty('chart')) {
                pv.chart = vis.addChart(viewSetting);
                pv.svg = pv.chart.svg.node();
            // }
            if(typeof(colorInfo) === 'object') {
                if(Array.isArray(colorInfo)) {
                    colorMap = colorInfo;
                } else {
                    if(colorInfo.hasOwnProperty('interpolate')) {
                        colorMode = (colorInfo.interpolate) ? 1 : 0;
                    }
                    colorMap = colorInfo.range || colorInfo.values; 
                }
            }

            colorManager.updateColors(colorMap, colorMode);
            
        } else {
            // $p.uniform.uVisDomains.data = pv.domains;
            if(pv.updateDomain === true) {
                pv.chart.updateAxisX(pv.domains[vmap.x]);
                pv.chart.updateAxisY(pv.domains[vmap.y]);
            }
        }
        $p.uniform.uVisDomains.data = Object.keys(pv.domains).map(f=>pv.domains[f]);
        $p.uniform.uVisMark.data = visMarks.indexOf(mark);
        $p.uniform.uGeoProjection.data = (vmap.project) ? 1 : 0;
        $p.uniform.uDropZeros.data = (vmap.dropZeros) ? 1 : 0;

        //Check if need interleaving data attributes(e.g.,parallel coordinates)
        if(Array.isArray(vmap.x) || Array.isArray(vmap.y)) {
            renderer = 'interleave';
            if(Array.isArray(vmap.x)){
                // vmap.x = vmap.x.reverse();
                $p.uniform.uInterleaveX = 0;
            } else if(Array.isArray(vmap.y)) {
                $p.uniform.uInterleaveX = 1;
            }
            renderers[renderer].updateInstancedAttribute(vmap.x);
            renderers[renderer].updateInstancedAttribute(vmap.y);
        } else if(vmap.mark && ['rect', 'bar'].indexOf(vmap.mark) !== -1) {
            renderer = 'polygon';
        }

        let gl = renderers[renderer].load();
        $p.framebuffer.enableRead('fFilterResults');
        $p.framebuffer.enableRead('fDerivedValues');
        $p.framebuffer.enableRead(vmap.in || 'fGroupResults');

        if($p.revealDensity) {
            $p.bindFramebuffer('offScreenFBO');
            gl.clearColor( 1.0, 1.0, 1.0, 0.0 );
            gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
            gl.blendFunc(gl.ONE, gl.ONE );
        } else {
            $p.bindFramebuffer(null);
            // gl.clearColor( 1.0, 1.0, 1.0, 0.0 );
            gl.blendFunc( gl.ONE, gl.ONE_MINUS_SRC_ALPHA );
            // gl.blendFunc(gl.SRC_COLOR, gl.ONE_MINUS_SRC_ALPHA);
        }
        gl.viewport(
            offset[0] + padding.left,
            viewport[1] - height + padding.bottom - offset[1],
            width - padding.left - padding.right,
            height - padding.top - padding.bottom
        );
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);

        let primitive = gl.POINTS;

        if(mark == 'line') {
            primitive = gl.LINE_STRIP;
            gl.lineWidth(vmap.size || 1.0);
        }

        extend($p, vmap, viewIndex, pv.domains);

        if($p.skipRender || vmap.project || vmap.append) {
            pv.chart.removeAxis();
            if($p.fields.indexOf(vmap.color)!==-1) pv.chart.removeLegend();
        }
        if(!$p.skipRender || vmap.append) {
            renderers[renderer].render(primitive);
        } 
        // else {
            // if(!$p._update) {
            //     gl.clearColor( 0.0, 0.0, 0.0, 0.0 );
            //     gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
            // }
        // }
        $p.skipRender = false;
        if($p.revealDensity) enhance({
            viewIndex: viewIndex,
            dim: [width, height],
            offset: offset,
            padding: padding
        });
        $p.bindFramebuffer(null);

        if(!$p._update) {
            let actions = Object.keys(vmap)
                .filter(function(act){ return userActions.indexOf(act) !== -1});

            actions.forEach(function(action) {
                let response = {};
                let viewId = vmap.id || $p.views[viewIndex].id;
                response[viewId] = vmap[action];
                let interactOptions = Object.assign({
                    event: action,
                    from: viewId,
                    response: response,
                }, vmap[action])
                $p.interactions.push(interactOptions)
            })
        }
    }
}
