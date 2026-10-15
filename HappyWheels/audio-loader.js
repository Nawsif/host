// Prefer the smaller MP3, then try alternate public asset URLs on load failure.
(() => {
  window.hwLoadAudioSprite = async function (Howl, sprite, setSound) {
    const folder='assets-99tnk64n1mubaoc8w/';
    const sources=[new URL(folder+'audiosprite.big.mp3',document.baseURI).href,new URL(folder+'audiosprite.big.ogg',document.baseURI).href];
    const base=new URL('./',document.baseURI);
    const github=base.hostname==='cdn.jsdelivr.net'&&base.pathname.match(/^\/gh\/([^/]+)\/([^/@]+)@([^/]+)\/(.*)$/);
    if(github)sources.push('https://raw.githubusercontent.com/'+github[1]+'/'+github[2]+'/'+github[3]+'/'+github[4]+folder+'audiosprite.big.mp3');
    let lastSound;
    for(const url of sources) {
      let sound;
      const loaded=await new Promise(resolve=>{
        let complete=false;
        const finish=value=>{if(!complete){complete=true;clearTimeout(timer);resolve(value);}};
        const timer=setTimeout(()=>finish(false),45000);
        try {
          sound=new Howl({src:[url],format:[url.endsWith('.ogg')?'ogg':'mp3'],sprite,preload:true,onload:()=>finish(true),onloaderror:()=>finish(false)});
          lastSound=sound;
          setSound(sound);
        } catch {finish(false);}
      });
      if(loaded)return sound;
      try {sound?.unload();}catch {}
      console.warn('Audio source failed; trying another source.');
    }
    // Retain the Howl method surface without letting play() restart failed loads.
    if(lastSound){lastSound.play=()=>null;lastSound.load=()=>lastSound;setSound(lastSound);}
    console.warn('Audio is unavailable. Starting the game without sound.');
    return null;
  };
})();
