(function(){try{
if(window.__lullReader){location.reload();return 'exit';}
function esc(t){return String(t||'').replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
var a=new Readability(document.cloneNode(true)).parse();
if(!a||!a.content||(a.textContent||'').trim().length<280)return 'none';
window.__lullReader=1;
var site=a.siteName||location.hostname.replace(/^www\./,'');
var mins=Math.max(1,Math.round((a.textContent||'').split(/\s+/).length/230));
var css=':root{--rs:19px;--bg:#F3F3F1;--ink:#1B1C20;--mu:#6B6D76;--ac:#3D7A80;color-scheme:light}'+
'@media (prefers-color-scheme:dark){:root{--bg:#121316;--ink:#E9E9EC;--mu:#9C9EA8;--ac:#7DBDC3;color-scheme:dark}}'+
'html,body{margin:0;background:var(--bg)!important;color:var(--ink)!important}'+
'body{font:var(--rs)/1.65 "Noto Serif",Georgia,serif;padding:22px 22px 60px}'+
'main{max-width:36em;margin:0 auto}'+
'.lull-site{font:600 12.5px system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--ac);margin:4px 0 10px}'+
'h1{font-size:1.6em;line-height:1.18;margin:0 0 10px}'+
'.lull-by{font:14px system-ui,sans-serif;color:var(--mu);margin:0 0 26px}'+
'main *{max-width:100%;box-sizing:border-box;background:transparent!important;color:inherit!important;font-family:inherit}'+
'img,video,figure{height:auto;border-radius:8px;margin:12px 0}'+
'figcaption{font:13px system-ui,sans-serif;color:var(--mu)!important}'+
'a{color:var(--ac)!important}'+
'pre,code{font:14px ui-monospace,monospace;white-space:pre-wrap}'+
'blockquote{border-left:3px solid var(--ac);margin:1em 0;padding-left:14px;color:var(--mu)!important}'+
'table{display:block;overflow-x:auto}';
document.documentElement.innerHTML='<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(a.title)+'</title><style>'+css+'</style></head><body><main><p class="lull-site">'+esc(site)+' · '+mins+' min read</p><h1>'+esc(a.title)+'</h1>'+(a.byline?'<p class="lull-by">'+esc(a.byline)+'</p>':'<p class="lull-by"></p>')+a.content+'</main></body>';
window.scrollTo(0,0);
return 'ok';
}catch(e){return 'none';}})();
