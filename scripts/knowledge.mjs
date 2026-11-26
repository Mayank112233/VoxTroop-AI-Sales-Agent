import { mkdir, readFile, writeFile } from 'node:fs/promises'

const readJson = async name => JSON.parse(await readFile(new URL('../src/data/' + name + '.json', import.meta.url), 'utf8'))
const [courses, academy] = await Promise.all([readJson('courses'), readJson('academy')])
const files = {
  'laa-overview-and-policies.txt': [academy.overview, academy.policies, ...academy.faq.map(pair => pair.join('\n'))].join('\n\n'),
}
for (const [name, matches] of [
  ['technology', course => course.category < 5],
  ['civil-services', course => course.category === 5 || course.category === 6],
  ['government-exams', course => course.category === 7],
]) {
  files['laa-' + name + '.txt'] = courses.filter(matches).map(course =>
    [course.title + (course.keywords ? ' (' + course.keywords + ')' : ''),
      academy.categories[course.category] + ' at Learn Anything Academy',
      'Fee: INR ' + course.fee + '. Duration: ' + course.months + (course.months === 1 ? ' month.' : ' months.'),
      'Mode: online. Level: ' + course.level + '. Languages: ' + course.languages.join(', ') + '.',
      course.description, 'Eligibility: ' + course.eligibility + '.',
      'Curriculum: ' + course.curriculum.join(', ') + '.',
      'Practice outcomes: apply ' + course.curriculum.slice(0, 3).join(', ') + ' to subject-specific exercises.',
    ].join('\n')).join('\n\n')
}

const output = new URL('../knowledge-output/', import.meta.url)
await mkdir(output, { recursive: true })
await Promise.all(Object.entries(files).map(([name, value]) => writeFile(new URL(name, output), value + '\n')))
console.log('Generated ' + Object.keys(files).length + ' knowledge documents.')

const fullSync = process.argv.includes('--sync')
if (fullSync || process.argv.includes('--catalogue-only')) {
  const admin = process.env.ADMIN_TOKEN
  if (!admin) throw new Error('Set ADMIN_TOKEN in the operator environment.')
  const base = process.env.VOXTROOP_ADMIN_URL || 'http://127.0.0.1:8000'
  async function api(path, options = {}) {
    const response = await fetch(new URL('/api' + path, base), {
      ...options, headers: { Authorization: 'Bearer ' + admin, ...options.headers },
    })
    if (!response.ok) throw new Error(options.method + ' ' + path + ' returned HTTP ' + response.status)
    if (response.status !== 204) return response.json()
  }
  const schema = await fetch(new URL('/openapi.json', base))
  if (!schema.ok || !(await schema.json()).components?.schemas?.BusinessConfig?.properties?.products) {
    throw new Error('The running VoxTroop backend does not support catalogue links. Restart it with the updated code first.')
  }
  const business = (await api('/businesses')).find(item => item.id === 'edunext')
  if (!business) throw new Error('VoxTroop education tenant edunext is missing.')
  if (fullSync) {
    const docs = await api('/edunext/knowledge')
    for (const [name, contents] of Object.entries(files)) {
      const form = new FormData()
      form.set('file', new Blob([contents], { type: 'text/plain' }), name)
      const result = await api('/edunext/knowledge', { method: 'POST', body: form })
      console.log('Indexed ' + name)
      if (docs.some(doc => doc.source === name && doc.id !== result.id)) {
        console.log('Review superseded versions in the Knowledge Base for ' + name)
      }
    }
    if (docs.some(doc => /^edunext-demo\.txt$/i.test(doc.source))) {
      console.log('Review the legacy edunext-demo.txt record in the Knowledge Base.')
    }
  }
  const config = business.config
  const site = process.env.ACADEMY_PUBLIC_URL || 'http://localhost:5174'
  const productConfig = {
    product_label: 'course',
    appointment_label: 'Academic counselling',
    appointment_label_hi: 'शैक्षणिक काउंसलिंग',
    products: courses.map(course => ({
      id: course.slug,
      name: course.title,
      url: new URL('/courses/' + course.slug, site).href,
      details: [
        academy.categories[course.category], course.description, course.keywords,
        course.level + '. ' + course.eligibility + '.',
        'INR ' + course.fee + ', ' + course.months + ' months, online.',
        'Topics: ' + course.curriculum.join(', '),
      ].filter(Boolean).join(' '),
    })),
  }
  const updated = await api('/businesses/edunext', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...config,
      ...productConfig,
      ...(fullSync ? {
          name: 'Learn Anything Academy',
          description: academy.overview + ' You are the Learn Anything Academy AI Counsellor. ' + academy.policies,
          widget_welcome: "Welcome to Learn Anything Academy! I'm your AI educational counsellor. I can help you explore technology, UPSC and government exam programmes. What would you like to learn?",
          widget_theme: 'blue',
          widget_origins: [...new Set([...config.widget_origins, new URL(site).origin])],
          consultation_fields: [
            { key: 'background', question: 'What is your educational background?', question_hi: 'आपकी शैक्षणिक पृष्ठभूमि क्या है?' },
            { key: 'career_goal', question: 'Which career or examination are you preparing for?', question_hi: 'आप किस करियर या परीक्षा की तैयारी कर रहे हैं?' },
            { key: 'preparation', question: 'What skills or exam preparation do you already have?', question_hi: 'आपके पास पहले से कौन से कौशल हैं या आपने कितनी तैयारी की है?' },
          ],
      } : {}),
    }),
  })
  if (updated.config.products?.length !== productConfig.products.length) {
    throw new Error('The Academy product catalogue was not saved.')
  }
  if (!fullSync) {
    console.log('Updated ' + productConfig.products.length + ' Academy catalogue entries.')
  } else {
    const indexed = await api('/edunext/knowledge')
    if (!Object.keys(files).every(name => indexed.some(doc => doc.source === name && doc.chunks > 0))) {
      throw new Error('The education index is missing expected documents.')
    }
    console.log('Verified education document entries and updated edunext settings.')
  }
}
