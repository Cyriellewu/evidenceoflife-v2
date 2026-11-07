import { describe, expect, it } from 'vitest';
import { autoClassifyTag } from '@/lib/autoTag';
import { inferWorkType } from '@/lib/workType';

describe('autoClassifyTag', () => {
  it('classifies study tasks', () => {
    expect(autoClassifyTag('finish CS336 homework')).toBe('study');
    expect(autoClassifyTag('复习论文')).toBe('study');
  });

  it('classifies work tasks', () => {
    expect(autoClassifyTag('update my resume on LinkedIn')).toBe('work');
  });

  it('classifies admin tasks', () => {
    expect(autoClassifyTag('change password for bank account')).toBe('admin');
  });

  it('returns undefined when nothing matches', () => {
    expect(autoClassifyTag('asdfghjkl')).toBeUndefined();
  });
});

describe('inferWorkType', () => {
  it('treats study/coding work as deep work', () => {
    expect(inferWorkType({ title: 'write essay and review notes' })).toBe('deep');
    expect(inferWorkType({ title: 'debug and build the project' })).toBe('deep');
  });

  it('treats shopping/pickup as an errand', () => {
    expect(inferWorkType({ title: 'buy groceries' })).toBe('errand');
  });

  it('treats rest/walks as recovery', () => {
    expect(inferWorkType({ title: 'go for a walk and rest' })).toBe('recovery');
  });

  it('treats forms/applications as admin', () => {
    expect(inferWorkType({ title: 'submit insurance form' })).toBe('admin');
  });

  it('falls back to shallow when there is no signal', () => {
    expect(inferWorkType({ title: '' })).toBe('shallow');
  });
});

import { autoClassifyTag as classifyForWords } from '@/lib/autoTag';

describe('autoClassifyTag word boundaries', () => {
  it('does not read "trip" inside "stripe"', () => {
    expect(classifyForWords('finish the stripe coding screen')).toBe('work');
  });
  it('still matches whole words, plurals and Chinese', () => {
    expect(classifyForWords('book flights to Boston')).toBe('travel');
    expect(classifyForWords('plan the trip')).toBe('travel');
    expect(classifyForWords('订机票')).toBe('travel');
    expect(classifyForWords('brunch with Amy')).not.toBe('health');
  });
});
