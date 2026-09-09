// Dependency-free checks of view rendering, escaping and displayed data.
// This is not a real browser test or visual layout verification.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const nodes=new Map();
function node(selector){if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',classList:{add(){},remove(){},toggle(){}},open:false,showModal(){this.open=true},close(){this.open=false}});return nodes.get(selector)}
const fixture={settings:{threshold:80,daily_limit:25,roles:['Full Stack'],locations:['Bengaluru'],min_salary_lpa:15,excluded_companies:[],keywords:[],boards:[],model:'qwen3:4b',run_at:'09:30',timezone:'Asia/Kolkata'},
profile:{name:'Alex Example',email:'alex@example.com',phone:'',location:'Bengaluru',years:3,resume_text:'React TypeScript',answers:{},verified:false},
jobs:[],events:[],attempts:[],messages:[],tasks:[],stats:{discovered:0,eligible:0,submitted:0,today:0},busy:false};
const errors=[];
const context=vm.createContext({document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){}},window:{addEventListener(){}},
location:{hash:''},setTimeout:()=>1,clearTimeout(){},setInterval(){},console,
fetch:async url=>({ok:true,json:async()=>url==='/api/session'?{token:'fixture-token'}:fixture})});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../jobpilot/static/automation.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../jobpilot/static/app.js'),'utf8'),context);
(async()=>{
  await new Promise(resolve=>setImmediate(resolve));
  for(const name of ['automation','overview','jobs','profile','tracker','sources','inbox','settings']){
    vm.runInContext(`page='${name}';render()`,context);
    const html=node('#main').innerHTML;
    assert(html.includes('<h1>'),`${name} has a heading`);
    assert(!html.includes('undefined'),`${name} has no undefined fields`);
    assert(!html.includes('NaN'),`${name} has no invalid numbers`);
  }
  fixture.jobs.push({id:'abc123abc123abc123ab',company:'<script>alert(1)</script>',title:'Full Stack Engineer',location:'Bengaluru',source:'manual',status:'prepared',url:'https://example.com/job',description:'<img src=x onerror=alert(1)>',match:{score:83.3,eligible:true,matched:['React'],missing:['Java'],blockers:[],warnings:[],method:'Coverage'}});
  fixture.stats.discovered=1;fixture.stats.eligible=1;
  vm.runInContext("page='jobs';render()",context);
  assert(node('#main').innerHTML.includes('&lt;script&gt;'));
  assert(!node('#main').innerHTML.includes('<script>'));
  assert(node('#main').innerHTML.includes('83.3%'));
  assert(node('#main').innerHTML.includes('1 skill gaps'));
  for(const name of ['overview','tracker'])vm.runInContext(`page='${name}';render()`,context);
  vm.runInContext("eligibleOnly=true;search='not-a-match';page='jobs';render()",context);
  assert(node('#main').innerHTML.includes('No opportunities yet'));
  fixture.questions=[{job_id:'abc123abc123abc123ab',company:'<script>bad</script>',detail:'Missing <img src=x onerror=bad>'}];
  fixture.discovery={sources:[{source:'linkedin',status:'unavailable',detail:'<script>unsafe</script>'}]};
  vm.runInContext("page='automation';render()",context);
  assert(!node('#main').innerHTML.includes('<script>'));
  assert(node('#main').innerHTML.includes('&lt;script&gt;'));
  console.log('PASS: 8 view renderers, discovery and question escaping, dynamic opportunity data and filtering.');
})().catch(error=>{console.error(error);process.exitCode=1});
