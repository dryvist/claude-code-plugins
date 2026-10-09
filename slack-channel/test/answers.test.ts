import { describe, expect, test } from 'bun:test'
import { allowWithAnswers, formatQuestion, resolveAnswer, type Question } from '../lib/core.ts'

const framework: Question = {
  question: 'Which framework?',
  header: 'Framework',
  options: [
    { label: 'React', description: 'Component library' },
    { label: 'Vue', description: 'Progressive framework' },
  ],
  multiSelect: false,
}

const features: Question = {
  question: 'Which features?',
  header: 'Features',
  options: [{ label: 'Auth' }, { label: 'Search' }, { label: 'Export' }],
  multiSelect: true,
}

describe('resolveAnswer', () => {
  test('a number picks the option at that 1-based position', () => {
    expect(resolveAnswer(framework, '2')).toEqual({ answer: 'Vue' })
    expect(resolveAnswer(framework, ' 1 ')).toEqual({ answer: 'React' })
  })

  test('a label picks case-insensitively', () => {
    expect(resolveAnswer(framework, 'vue')).toEqual({ answer: 'Vue' })
    expect(resolveAnswer(framework, 'REACT')).toEqual({ answer: 'React' })
  })

  test('free text is taken as the answer (Other)', () => {
    expect(resolveAnswer(framework, 'Svelte')).toEqual({ answer: 'Svelte' })
  })

  test('an out-of-range number asks again instead of guessing', () => {
    const r = resolveAnswer(framework, '5')
    expect('error' in r && r.error).toContain('1-2')
  })

  test('single select keeps a comma reply as free text', () => {
    expect(resolveAnswer(framework, '1,2')).toEqual({ answer: '1,2' })
  })

  test('multi-select joins picks with a comma and space', () => {
    expect(resolveAnswer(features, '1,3')).toEqual({ answer: 'Auth, Export' })
    expect(resolveAnswer(features, ' search , 3 ')).toEqual({ answer: 'Search, Export' })
  })

  test('multi-select drops empty parts and rejects an empty reply', () => {
    expect(resolveAnswer(features, '1,,2')).toEqual({ answer: 'Auth, Search' })
    expect('error' in resolveAnswer(features, ' , ')).toBe(true)
    expect('error' in resolveAnswer(features, '')).toBe(true)
  })

  test('multi-select rejects an out-of-range number in the list', () => {
    expect('error' in resolveAnswer(features, '1,9')).toBe(true)
  })
})

describe('AskUserQuestion output', () => {
  test('answers are keyed by question text and echo the original questions', () => {
    const answers = { [framework.question]: 'Vue', [features.question]: 'Auth, Export' }
    const out = allowWithAnswers([framework, features], answers)
    expect(out.hookSpecificOutput.hookEventName).toBe('PreToolUse')
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow')
    expect(out.hookSpecificOutput.updatedInput.questions).toEqual([framework, features])
    expect(out.hookSpecificOutput.updatedInput.answers).toEqual({
      'Which framework?': 'Vue',
      'Which features?': 'Auth, Export',
    })
  })

  test('the posted question lists numbered options and the reply instruction', () => {
    const text = formatQuestion(framework, 1, 2)
    expect(text).toContain('*Question 1/2* (Framework)')
    expect(text).toContain('1. React - Component library')
    expect(text).toContain('2. Vue - Progressive framework')
    expect(text).toContain('Reply with a number or the option label.')
    expect(formatQuestion(features, 2, 2)).toContain('comma-separated')
  })

  test('question text from the model is escaped and redacted before posting', () => {
    const q: Question = {
      question: 'Use <!channel> & key token=abc123secret?',
      options: [{ label: 'yes' }],
    }
    const text = formatQuestion(q, 1, 1)
    expect(text).not.toContain('<!channel>')
    expect(text).toContain('&lt;!channel&gt; &amp;')
    expect(text).toContain('token=[REDACTED]')
  })
})
