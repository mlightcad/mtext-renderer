import { describe, expect, it } from 'vitest'

import {
  estimateMTextWrapWidth,
  resolveMTextWrapWidth
} from '../../src/renderer/mtextDataUtils'

describe('resolveMTextWrapWidth', () => {
  it('expands an impossible positive mtext wrap width before rendering', () => {
    const mtextData = {
      text: '设计依据\\P建筑机电工程抗震设计规范',
      height: 100,
      width: 0.5
    }

    expect(resolveMTextWrapWidth(mtextData)).toBe(960)
    expect(mtextData.width).toBe(0.5)
  })

  it('keeps a plausible mtext wrap width unchanged', () => {
    const mtextData = {
      text: '设计依据',
      height: 100,
      width: 300
    }

    expect(resolveMTextWrapWidth(mtextData)).toBe(300)
  })

  it('keeps zero width as no-wrap', () => {
    const mtextData = {
      text: '设计依据',
      height: 100,
      width: 0
    }

    expect(resolveMTextWrapWidth(mtextData)).toBe(0)
  })

  it('keeps unconstrained width unchanged', () => {
    const mtextData = {
      text: '设计依据',
      height: 100,
      width: Number.POSITIVE_INFINITY
    }

    expect(resolveMTextWrapWidth(mtextData)).toBe(Number.POSITIVE_INFINITY)
  })

  it('replaces absurdly large declared widths with a content estimate', () => {
    const mtextData = {
      text: '{(474.410)}',
      height: 4.0222404674496,
      width: 128_307_003.20375
    }

    const estimated = estimateMTextWrapWidth(mtextData.text, mtextData.height)

    expect(resolveMTextWrapWidth(mtextData)).toBe(estimated)
    expect(resolveMTextWrapWidth(mtextData)).toBeLessThan(1_000)
    expect(mtextData.width).toBe(128_307_003.20375)
  })
})

describe('estimateMTextWrapWidth', () => {
  it('uses the longest explicit line after paragraph breaks', () => {
    expect(
      estimateMTextWrapWidth('设计依据\\P建筑机电工程抗震设计规范', 100)
    ).toBe(960)
    expect(estimateMTextWrapWidth('short\\Plonger', 10)).toBe(48)
  })
})
