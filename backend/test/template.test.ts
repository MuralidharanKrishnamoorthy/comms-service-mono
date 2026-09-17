import { test } from 'node:test'
import assert from 'node:assert/strict'
import { htmlToPlainText, renderTemplate, validateVariables, MissingVariablesError } from '../src/lib/template.js'
import { applyDeferredStyles } from '../src/lib/unicodeStyle.js'

// What dispatchSend does for the SMS and push channels, start to finish.
const send = (html: string, data: Record<string, unknown> = {}) =>
  applyDeferredStyles(renderTemplate(htmlToPlainText(html, { styleWithUnicode: true }), data))

test('markup never reaches a plain-text channel', () => {
  const out = send('<p>Hi <b>there</b></p>')
  assert.equal(/<[a-z]/i.test(out), false)
})

test('bold and italic survive as Unicode characters', () => {
  assert.equal(send('<b>Sale</b> now'), '𝗦𝗮𝗹𝗲 now')
  assert.equal(send('<strong>Sale</strong>'), '𝗦𝗮𝗹𝗲')
  assert.equal(send('<i>now</i>'), '𝘯𝘰𝘸')
  assert.equal(send('<b>a<i>b</i></b>'), '𝗮𝙗')
})

test('underline and strikethrough use combining marks', () => {
  assert.equal(send('<u>ab</u>'), 'a̲b̲')
  assert.equal(send('<s>ab</s>'), 'a̶b̶')
})

test('colour and images have no plain-text equivalent and are dropped', () => {
  assert.equal(send('<span style="color:#f00">Red</span>'), 'Red')
  assert.equal(send('a<img src="x.png" />b'), 'ab')
})

test('structure with a plain-text equivalent is kept', () => {
  assert.equal(send('one<br>two'), 'one\ntwo')
  assert.equal(send('<ul><li>a</li><li>b</li></ul>'), '• a\n• b')
})

test('a body with no markup is passed through untouched', () => {
  assert.equal(send('Hi {{name}}, code {{code}}.', { name: 'M', code: '1' }), 'Hi M, code 1.')
})

test('styling a variable styles its value, not its name', () => {
  // Styling the name in place would leave it spelled in Mathematical
  // Alphanumerics, so renderTemplate could no longer match it.
  assert.equal(send('Hi <b>{{name}}</b>', { name: 'Murali' }), 'Hi 𝗠𝘂𝗿𝗮𝗹𝗶')
  assert.equal(send('code <i>{{code}}</i>', { code: 'A1' }), 'code 𝘈1')
})

test('an unsubstituted variable stays readable', () => {
  assert.equal(send('Hi <b>{{name}}</b>'), 'Hi {{name}}')
})

test('a value containing markup characters is not mistaken for a tag', () => {
  assert.equal(send('<p>{{note}}</p>', { note: 'a < b' }), 'a < b')
})

test('no internal markers escape into a delivered message', () => {
  const out = send('<b>{{a}}</b> <i>{{b}}</i>', { a: 'x', b: 'y' })
  assert.equal(/[-]/.test(out), false)
})

test('entities are decoded once, and not styled', () => {
  assert.equal(send('<b>a</b> &amp; b'), '𝗮 & b')
  assert.equal(send('&amp;lt;'), '&lt;')
})

test('renderTemplate escapes substituted values for email', () => {
  assert.equal(
    renderTemplate('<p>{{name}}</p>', { name: '<script>' }, { escapeHtml: true }),
    '<p>&lt;script&gt;</p>'
  )
})

test('renderTemplate leaves a variable inside an attribute usable', () => {
  assert.equal(
    renderTemplate('<a href="{{url}}">x</a>', { url: '/i/9' }, { escapeHtml: true }),
    '<a href="/i/9">x</a>'
  )
})

test('validateVariables names every missing key', () => {
  assert.throws(
    () => validateVariables(['a', 'b'], { a: 1 }),
    (err: unknown) => err instanceof MissingVariablesError && err.missing.join() === 'b'
  )
  assert.doesNotThrow(() => validateVariables(['a'], { a: 1 }))
})
