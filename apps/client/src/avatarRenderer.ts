import { avatarOption, type AvatarConfig, type PlayerDirection } from '@enico/protocol';

export const AVATAR_WIDTH = 32;
export const AVATAR_HEIGHT = 40;

export function drawAvatarFrame(
  ctx: CanvasRenderingContext2D,
  avatar: AvatarConfig,
  direction: PlayerDirection = 'south',
  step = 0,
) {
  ctx.clearRect(0, 0, AVATAR_WIDTH, AVATAR_HEIGHT);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  const skin = avatarOption('skinTone', avatar.skinTone).color;
  const hair = avatarOption('hairColor', avatar.hairColor).color;
  const outfit = avatarOption('outfitColor', avatar.outfitColor).color;
  const dark = '#17131c'; const pink = '#f0a5c2'; const white = '#fff1f5';
  const px = (x:number,y:number,w:number,h:number,c:string) => { ctx.fillStyle=c; ctx.fillRect(x,y,w,h); };

  if (avatar.aura !== 'none') {
    ctx.globalAlpha=.85;
    if (avatar.aura==='hearts') { px(2,9,2,2,pink); px(4,7,2,2,pink); px(27,15,2,2,pink); }
    if (avatar.aura==='sparkles') { px(3,5,1,5,white); px(1,7,5,1,white); px(28,11,1,5,white); }
    if (avatar.aura==='glitch') { px(1,13,6,1,'#ff3e91'); px(25,6,5,1,'#915cff'); px(3,29,4,1,'#ff3e91'); }
    if (avatar.aura==='bats') { px(1,10,2,1,dark); px(4,10,2,1,dark); px(27,7,2,1,dark); px(24,7,2,1,dark); }
    if (avatar.aura==='thorns') { ctx.strokeStyle='#68233f'; ctx.strokeRect(2,4,28,34); }
    ctx.globalAlpha=1;
  }

  const side = direction==='east' ? 1 : direction==='west' ? -1 : 0;
  // hair silhouette: oversized cute head
  if (avatar.hairStyle==='twintail') { px(2,8,6,17,hair); px(24,8,6,17,hair); px(1,16,4,10,hair); px(27,16,4,10,hair); }
  if (avatar.hairStyle==='long') { px(5,6,22,25,hair); }
  if (avatar.hairStyle==='hime') { px(5,5,22,20,hair); px(3,14,5,15,hair); px(24,14,5,15,hair); }
  if (avatar.hairStyle==='wolf') { px(5,6,22,17,hair); px(3,18,5,7,hair); px(24,18,5,8,hair); px(7,23,4,4,hair); }
  if (avatar.hairStyle==='bob') { px(5,6,22,19,hair); px(4,16,4,8,hair); px(24,16,4,8,hair); }
  if (avatar.hairStyle==='bun') { px(3,4,8,8,hair); px(21,4,8,8,hair); px(5,7,22,17,hair); }
  px(7,7,18,17,hair);
  if (avatar.hairColor==='split') px(16,7,9,17,'#8d6bad');
  // face
  px(8,10,16,13,skin); px(7,13,1,7,skin); px(24,13,1,7,skin);
  if (direction!=='north') {
    const eyeY=15, lx=side>0?15:11, rx=side<0?17:20;
    if (avatar.eyes==='doll' || avatar.eyes==='teary') { px(lx,eyeY,3,4,dark); px(rx,eyeY,3,4,dark); px(lx+1,eyeY,1,1,white); px(rx+1,eyeY,1,1,white); }
    if (avatar.eyes==='droop') { px(lx,eyeY+1,3,2,dark); px(rx,eyeY+1,3,2,dark); }
    if (avatar.eyes==='sparkle') { px(lx,eyeY,3,3,'#744a8f'); px(rx,eyeY,3,3,'#744a8f'); px(lx+1,eyeY,1,1,white); px(rx+1,eyeY,1,1,white); }
    if (avatar.eyes==='cross') { px(lx,eyeY,3,1,dark); px(lx+1,eyeY-1,1,3,dark); px(rx,eyeY,3,1,dark); px(rx+1,eyeY-1,1,3,dark); }
    px(9,20,3,1,pink); px(21,20,3,1,pink); px(15,20,2,1,'#9c596f');
    if (avatar.eyes==='teary') { px(lx+1,19,1,2,'#9fe5ff'); px(rx+1,19,1,2,'#9fe5ff'); }
  }
  // fringe
  px(7,7,18,5,hair); px(9,11,4,3,hair); px(18,11,5,3,avatar.hairColor==='split'?'#8d6bad':hair);
  // body and outfits
  px(10,24,12,9,outfit); px(7,25,3,7,skin); px(22,25,3,7,skin);
  if (avatar.outfit==='lace' || avatar.outfit==='goth') { px(7,30,18,5,outfit); px(6,34,20,2,dark); px(8,33,2,2,white); px(14,33,2,2,white); px(20,33,2,2,white); }
  if (avatar.outfit==='sailor') { px(10,24,12,3,white); px(15,26,2,5,pink); }
  if (avatar.outfit==='hoodie') { px(8,23,16,11,outfit); px(14,25,1,5,white); px(18,25,1,5,white); }
  if (avatar.outfit==='nurse') { px(10,24,12,9,white); px(15,25,2,6,outfit); px(13,27,6,2,outfit); }
  if (avatar.outfit==='idol') { px(9,24,14,10,outfit); px(14,24,4,3,pink); px(12,31,8,2,white); }
  // neck bow
  px(13,23,3,3,pink); px(17,23,3,3,pink); px(15,24,3,3,'#7d294e');
  const shift=step?1:0; const leg='#24202b';
  px(10,35,5,4-shift,avatar.legwear==='bare'?skin:leg); px(17,35+shift,5,4-shift,avatar.legwear==='bare'?skin:leg);
  if (avatar.legwear==='striped') { px(10,36,5,1,white); px(17,37,5,1,white); }
  if (avatar.legwear==='garter') { px(10,35,5,1,pink); px(17,35,5,1,pink); }
  if (avatar.legwear==='fishnet') { px(11,36,1,1,white); px(13,38,1,1,white); px(18,36,1,1,white); px(20,38,1,1,white); }
  px(9,39-shift,7,1,dark); px(16,39,7,1,dark);
  // head accessories
  if (avatar.headAccessory==='bigbow') { px(5,4,8,6,pink); px(19,4,8,6,pink); px(13,6,6,5,'#7d294e'); }
  if (avatar.headAccessory==='catears') { px(6,2,7,7,hair); px(19,2,7,7,hair); px(8,4,3,3,pink); px(21,4,3,3,pink); }
  if (avatar.headAccessory==='halo') { px(8,2,16,1,'#f5d8ff'); px(6,3,2,1,'#f5d8ff'); px(24,3,2,1,'#f5d8ff'); }
  if (avatar.headAccessory==='horns') { px(6,3,4,5,'#6e3157'); px(22,3,4,5,'#6e3157'); }
  if (avatar.headAccessory==='headphones') { px(4,12,4,8,pink); px(24,12,4,8,pink); px(7,6,18,2,dark); }
  if (avatar.headAccessory==='bonnet') { px(5,4,22,4,white); px(4,7,4,8,white); px(24,7,4,8,white); }
  // face accessories
  if (direction!=='north') {
    if (avatar.faceAccessory==='bandage') { px(19,19,5,3,white); px(21,20,1,1,pink); }
    if (avatar.faceAccessory==='eyepatch') { px(18,14,6,5,dark); px(20,15,2,2,pink); }
    if (avatar.faceAccessory==='mask') { px(11,19,11,4,dark); px(14,20,5,1,pink); }
    if (avatar.faceAccessory==='tears') { px(12,19,1,4,'#8edcff'); px(21,19,1,4,'#8edcff'); }
    if (avatar.faceAccessory==='piercing') px(23,19,1,1,'#f5e58d');
  }
}
