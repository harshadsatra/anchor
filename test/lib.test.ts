import { describe, expect, it } from 'vitest'
import { parseWindowList, sortGroups } from '../src/shared/lib'
import type { AppGroup } from '../src/shared/types'

describe('parseWindowList', () => {
  const parsed = parseWindowList(
    [
      'Finder|||1|||Downloads',
      'Finder|||3|||Downloads', // same title, different AX index
      'Code|||2|||README.md',
      'Weird|||1|||a|||b', // title legitimately contains the delimiter
      'Bad line without delimiters',
      'Missing|||notanumber|||x',
      '',
    ].join('\n'),
  )

  it('keeps duplicate titles distinct by AX index', () => {
    expect(parsed.get('Finder')).toEqual([
      { title: 'Downloads', index: 1 },
      { title: 'Downloads', index: 3 },
    ])
  })

  it('uses the real AX index, not output position', () => {
    expect(parsed.get('Code')).toEqual([{ title: 'README.md', index: 2 }])
  })

  it('preserves titles containing the ||| delimiter', () => {
    expect(parsed.get('Weird')).toEqual([{ title: 'a|||b', index: 1 }])
  })

  it('rejects malformed lines', () => {
    expect(parsed.has('Missing')).toBe(false)
    expect(parsed.size).toBe(3)
    expect(parseWindowList('').size).toBe(0)
  })
})

describe('sortGroups', () => {
  const groups: AppGroup[] = [
    { appName: 'Zed', windows: [1, 2, 3] as never, icon: null, lastFrontAt: 0 },
    { appName: 'Arc', windows: [1] as never, icon: null, lastFrontAt: 500 },
    { appName: 'Mail', windows: [1, 2] as never, icon: null, lastFrontAt: 900 },
    { appName: 'Bear', windows: [1] as never, icon: null, lastFrontAt: 0 },
  ]
  const names = (mode: Parameters<typeof sortGroups>[1]): string[] =>
    sortGroups(groups, mode).map((g) => g.appName)

  it('sorts alphabetically', () => expect(names('name')).toEqual(['Arc', 'Bear', 'Mail', 'Zed']))
  it('sorts by window count', () => expect(names('count')).toEqual(['Zed', 'Mail', 'Arc', 'Bear']))

  it('sorts seen-front apps newest first, then never-seen A-Z', () => {
    expect(names('recent')).toEqual(['Mail', 'Arc', 'Bear', 'Zed'])
  })

  it('does not mutate the input', () => {
    sortGroups(groups, 'name')
    expect(groups[0].appName).toBe('Zed')
  })
})
