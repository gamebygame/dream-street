import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',timeout:45_000,workers:1,fullyParallel:false,
  reporter:[['list'],['json',{outputFile:'artifacts/g1/browser-results.json'}]],
  use:{channel:'chrome',headless:true,baseURL:'http://127.0.0.1:5173',viewport:{width:1440,height:900},screenshot:'only-on-failure'},
  webServer:{command:'npm run dev -- --port 5173 --strictPort',url:'http://127.0.0.1:5173',reuseExistingServer:true,timeout:30_000},
});
