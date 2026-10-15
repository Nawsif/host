// Local profile and first-run defaults for the browser port.
(() => {
  const usernameKey='hw.offline.username';
  function getUsername() {
    try {return localStorage.getItem(usernameKey)?.trim() || 'Player';}
    catch {return 'Player';}
  }
  function applyDefaults(shared) {
    if(shared.data.hwBrowserDefaultsVersion===1)return;
    Object.assign(shared.data,{textureResolution:'medium',renderResolutionIncrease:2,use60FPS:true,maxParticles:1000,hwBrowserDefaultsVersion:1});
    shared.flush();
  }
  function setUsername() {
    const answer=window.prompt('Set username (1–24 characters)',getUsername());
    if(answer===null)return;
    const name=answer.trim();
    if(!name||name.length>24){window.alert('Enter a username from 1 to 24 characters.');return;}
    try {localStorage.setItem(usernameKey,name);}
    catch {window.alert('The browser could not save your username.');return;}
    window.location.reload();
  }
  function openCredit() {window.open('https://historystudyguide.github.io','_blank','noopener,noreferrer');}
  window.hwBrowser={getUsername,applyDefaults,setUsername,openCredit};
  if(window.HW_SETTINGS)window.HW_SETTINGS.username=getUsername();
})();
