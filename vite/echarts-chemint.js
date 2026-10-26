/* chemint · vite/echarts-chemint.js — ECharts 6 yang dipangkas (v2.61).
 * Hanya bagian yang dipakai Kalender Sebaran; sisanya dibuang Vite.
 * Bila nanti ada grafik ECharts lain, tambahkan modulnya di sini. */
import * as echarts from 'echarts/core';
import { HeatmapChart } from 'echarts/charts';
import { CalendarComponent, TooltipComponent, VisualMapPiecewiseComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([HeatmapChart, CalendarComponent, TooltipComponent, VisualMapPiecewiseComponent, CanvasRenderer]);

export { echarts };
