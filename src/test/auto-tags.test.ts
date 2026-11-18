import { describe, it, expect } from 'vitest';
import { detectAutoTags } from '@/components/InputPlusMenu';

describe('detectAutoTags', () => {
  it('does not tag a ride as a phone call', () => {
    expect(detectAutoTags('Called a shuttle but it was far away')).not.toContain('📞 Call');
    expect(detectAutoTags('called an uber home')).not.toContain('📞 Call');
  });
  it('still tags real calls', () => {
    expect(detectAutoTags('Called mom')).toContain('📞 Call');
    expect(detectAutoTags('phone interview')).toContain('📞 Call');
    expect(detectAutoTags('给家里打电话')).toContain('📞 Call');
  });
  it('matches at word starts only', () => {
    expect(detectAutoTags('start the report')).not.toContain('🎨 Art');
    expect(detectAutoTags('team workshop')).not.toContain('🛒 Shop');
    expect(detectAutoTags('walking by the river')).toContain('🚶 Walk');
    expect(detectAutoTags('quick café stop')).toContain('☕ Coffee');
  });
  it('tags food words as Dine, without catching "phone" or "photo"', () => {
    expect(detectAutoTags('pho')).toContain('🍳 Dine');
    expect(detectAutoTags('pho 999 Pho, Reno')).toContain('🍳 Dine');
    expect(detectAutoTags('吃了越南粉')).toContain('🍳 Dine');
    expect(detectAutoTags('ramen with Sam')).toContain('🍳 Dine');
    expect(detectAutoTags('took a photo')).not.toContain('🍳 Dine');
    expect(detectAutoTags('phone died')).not.toContain('🍳 Dine');
    expect(detectAutoTags('great meeting')).not.toContain('🍳 Dine');
  });
});
