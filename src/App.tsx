import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { ArrowDownRight, ArrowRight, BookOpen, BrainCircuit, ChartNoAxesCombined, Clock3, Cloud, CodeXml, Compass, GraduationCap, Landmark, Menu, MessageCircle, Search, ShieldCheck, Sparkles, X } from 'lucide-react'
import courseData from './data/courses.json'
import academy from './data/academy.json'
import { loadCounsellor, openCounsellor } from './widget'

interface Course {
  slug: string
  title: string
  months: number
  fee: number
  category: number
  description: string
  curriculum: string[]
  eligibility: string
  level: string
  languages: string[]
  keywords: string
  featured: boolean
}

const courses: Course[] = courseData
const icons = [BrainCircuit, ChartNoAxesCombined, CodeXml, Cloud, ShieldCheck, Landmark, BookOpen, GraduationCap, Compass]
const categoryNames = ['AI & Machine Learning', 'Data Science & Analytics', 'Software Development', 'Cloud & DevOps', 'Cybersecurity', 'UPSC Civil Services', 'State PCS', 'Government & Banking', 'Professional Development']
const nav = [['Home', '/'], ['Explore Courses', '/courses'], ['Technology', '/technology'], ['UPSC & Civil Services', '/civil-services'], ['Government Exams', '/government-exams'], ['About', '/about'], ['Contact', '/contact']]
const featured = courses.filter(course => course.featured && course.category < 5).slice(0, 3)
const fee = (course: Course) => '₹' + course.fee.toLocaleString('en-IN')
const duration = (course: Course) => course.months + (course.months === 1 ? ' month' : ' months')
const categoryUrl = (category: number) => '/courses?category=' + category

function Counsellor({ children = 'Talk to AI Counsellor', kind = 'secondary' }: { children?: ReactNode; kind?: string }) {
  const [error, setError] = useState(false)
  return <><button className={'btn ' + kind} onClick={() => { setError(false); void openCounsellor().catch(() => setError(true)) }}><Sparkles size={16} />{children}</button>{error && <span className="widget-error" role="status">Counsellor unavailable. Check that VoxTroop is running and try again.</span>}</>
}

function Brand() {
  return <Link className="brand" to="/"><img src="/mark.svg" alt="" width="40" height="40" /><span>Learn Anything<small>ACADEMY</small></span></Link>
}

function Header() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  useEffect(() => setOpen(false), [location.pathname, location.search])
  return <><a className="skip" href="#main">Skip to content</a><div className="announce">Explore technology, civil services and career-focused learning programmes. <Link to="/courses">Browse courses <ArrowRight size={13}/></Link></div><header><div className="wrap nav"><Brand/><button className="menu" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="primary-nav" aria-label={open ? 'Close navigation' : 'Open navigation'}>{open ? <X/> : <Menu/>}</button><nav id="primary-nav" className={open ? 'is-open' : ''} aria-label="Main navigation">{nav.map(([label, url]) => <NavLink end key={url} to={url} onClick={() => setOpen(false)}>{label}</NavLink>)}<Counsellor kind="nav-cta">AI Counsellor</Counsellor></nav></div></header></>
}

function Footer() {
  return <footer><div className="wrap footer-grid"><div><Brand/><p>Online learning and personalised course guidance for ambitions across technology and public service.</p></div><div><strong>Explore programmes</strong>{nav.slice(1, 5).map(([label, url]) => <Link key={url} to={url}>{label}</Link>)}</div><div><strong>Academy</strong><Link to="/about">About us</Link><Link to="/contact">Contact</Link><Link to="/privacy">Privacy policy</Link><Link to="/terms">Terms and disclaimer</Link></div><div><strong>Course counselling</strong><p>hello@learnanything.example<br/>Demonstration email address</p><span>Powered by VoxTroop</span></div></div><div className="wrap footer-note">Learn Anything Academy is a fictional educational demonstration. Course fees and programme information are illustrative.</div></footer>
}

function CategoryLinks({ ids }: { ids: number[] }) {
  return <div className="category-grid">{ids.map(id => {
    const Icon = icons[id]
    return <Link key={id} className={'category tone-' + id % 4} to={categoryUrl(id)}><span className="tile-icon"><Icon size={21}/></span><strong>{categoryNames[id]}</strong><ArrowDownRight size={16} className="tile-arrow"/></Link>
  })}</div>
}

function Cards({ items, compare, selected = [], counselling = false }: { items: Course[]; compare?: (id: string) => void; selected?: string[]; counselling?: boolean }) {
  return <div className="cards">{items.map(course => {
    const Icon = icons[course.category]
    const id = course.slug
    return <article className="course" key={id}><div className={'course-art tone-' + course.category % 4}><Icon size={48} strokeWidth={1.4}/><span>{categoryNames[course.category]}</span></div><div className="course-body"><h3><Link to={'/courses/' + id}>{course.title}</Link></h3><p>{course.description}</p><div className="meta"><Clock3 size={15}/>{duration(course)}<span>·</span>{course.level}</div><div className="course-bottom"><strong>{fee(course)}</strong><Link to={'/courses/' + id}>View details <ArrowRight size={15}/></Link></div>{counselling && <div className="card-counselling"><Counsellor>Ask AI Counsellor</Counsellor></div>}{compare && <label className="compare-check"><input type="checkbox" checked={selected.includes(id)} disabled={selected.length >= 3 && !selected.includes(id)} onChange={() => compare(id)}/> Add to comparison</label>}</div></article>
  })}</div>
}

function FAQs() {
  return <div className="faq">{academy.faq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
}

function CounsellingPanel() {
  return <section className="counselling"><div className="wrap split"><div><span className="section-tag"><Sparkles size={16}/> POWERED BY VOXTROOP</span><h2>Not sure what to learn? Let AI guide you.</h2><p>Explore suitable courses, compare fees, ask about eligibility and discuss exam preparation in English or Hindi. You can also request a counselling appointment.</p><Counsellor kind="primary"/></div><div className="prompt-list"><p><MessageCircle size={19}/> Which course fits my career goals?</p><p><MessageCircle size={19}/> How should I start preparing for UPSC?</p><p><MessageCircle size={19}/> Can I book a counselling session?</p></div></div></section>
}

function Home() {
  return <><section className="hero"><div className="wrap hero-inner"><div className="hero-copy"><span className="section-tag"><span className="dot"/> ONLINE LEARNING FOR EVERY AMBITION</span><h1>Learn Anything.<br/><em>Achieve Everything.</em></h1><p>Build your future with expert-designed learning programmes in technology, artificial intelligence, civil services and competitive examinations.</p><div className="actions"><Link className="btn primary" to="/courses">Explore Courses <ArrowRight size={18}/></Link><Counsellor/></div><div className="hero-notes"><span><BookOpen size={17}/> {courses.length} programmes</span><span><Compass size={17}/> Flexible online learning</span></div></div><div className="hero-visual"><img src="/learners.jpg" alt="Two students studying with a laptop and notebook in a campus library" fetchPriority="high"/><div className="hero-label"><span className="tile-icon"><GraduationCap size={23}/></span><span><strong>One platform. Endless possibilities.</strong><small>Technology · Civil services · Competitive exams</small></span></div></div></div></section>
  <section className="wrap section"><div className="section-head"><div><span className="section-tag">FIND YOUR PATH</span><h2>Explore learning categories</h2><p>Build a new skill or prepare for your next exam.</p></div><Link className="text-link" to="/courses">View all courses <ArrowRight size={17}/></Link></div><CategoryLinks ids={[0,1,2,3,4,5,6,7,8]}/></section>
  <section className="soft"><div className="wrap section"><div className="section-head"><div><span className="section-tag">TECHNOLOGY PROGRAMMES</span><h2>Build skills you can put to work</h2></div><Link className="text-link" to="/technology">Explore technology <ArrowRight size={17}/></Link></div><Cards items={featured} counselling/></div></section>
  <section className="wrap section split civil-feature"><div><span className="section-tag">CIVIL SERVICES</span><h2>Prepare for a career in public service.</h2><p>Structured learning for UPSC Civil Services and State PCS aspirants.</p><div className="actions"><Link className="btn primary" to="/civil-services">Explore civil services <ArrowRight size={17}/></Link><Counsellor/></div></div><div className="civil-topics">{['Foundation', 'General Studies', 'Prelims', 'Mains Answer Writing', 'CSAT', 'Current Affairs', 'Optional Subjects', 'Interview Guidance'].map(topic => <Link key={topic} to={'/courses?category=5&q=' + encodeURIComponent(topic === 'Optional Subjects' ? 'Optional' : topic)}><Landmark size={16}/>{topic}</Link>)}</div></section>
  <section className="soft"><div className="wrap section"><div className="section-head"><div><span className="section-tag">COMPETITIVE EXAMS</span><h2>Government examination preparation</h2></div><Link className="text-link" to="/government-exams">Explore exam programmes <ArrowRight size={17}/></Link></div><div className="civil-topics">{['SSC', 'Banking', 'Railway', 'Defence', 'State PCS'].map(exam => <Link key={exam} to={exam === 'State PCS' ? categoryUrl(6) : '/courses?category=7&q=' + exam}><BookOpen size={16}/>{exam}</Link>)}</div></div></section>
  <section className="wrap section"><h2>Why Learn Anything Academy?</h2><div className="benefits">{[['Structured learning paths','Work through a curriculum in a clear order.'],['Practice-based learning','Apply what you study through projects, drills and mock examinations.'],['Flexible online programmes','Pick a programme that fits your learning goals and available time.'],['Personalised guidance','Discuss your options with the multilingual course counsellor.']].map(([title, copy]) => <div key={title}><ShieldCheck size={23}/><h3>{title}</h3><p>{copy}</p></div>)}</div></section>
  <CounsellingPanel/><section className="wrap section"><h2>How it works</h2><ol className="steps">{['Explore programmes', 'Discuss your goals', 'Compare recommendations', 'Request a counselling session', 'Choose your learning path'].map(step => <li key={step}>{step}</li>)}</ol></section>
  <section className="soft"><div className="wrap section split faq-layout"><div><span className="section-tag">COURSE GUIDANCE</span><h2>Frequently asked questions</h2><Link className="text-link" to="/contact">Contact the Academy <ArrowRight size={17}/></Link></div><FAQs/></div></section></>
}

function Catalogue() {
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState<string[]>([])
  const field = (key: string) => params.get(key) || ''
  const change = (key: string, value: string) => setParams(current => {
    const next = new URLSearchParams(current)
    if (value) next.set(key, value)
    else next.delete(key)
    return next
  }, { replace: true })
  const matching = courses.filter(course => {
    const haystack = [course.title, academy.categories[course.category], course.keywords, course.description, ...course.curriculum].join(' ').toLowerCase()
    const category = field('category')
    return field('q').trim().toLowerCase().split(/\s+/).every(word => haystack.includes(word))
      && (!category || Number(category) === course.category || category === '8' && /Python Programming|Business Intelligence|Data Analytics|SQL & Database/i.test(course.title))
      && (!field('level') || course.level === field('level'))
      && (!field('duration') || (field('duration') === 'short' ? course.months <= 6 : course.months > 6))
      && (!field('fee') || (field('fee') === 'low' ? course.fee <= 15000 : field('fee') === 'mid' ? course.fee > 15000 && course.fee <= 35000 : course.fee > 35000))
  }).sort((a,b) => field('sort') === 'low' ? a.fee-b.fee : field('sort') === 'high' ? b.fee-a.fee : Number(b.featured)-Number(a.featured))
  const comparison = courses.filter(course => selected.includes(course.slug))
  const filters: [string, string, [string,string][]][] = [
    ['Category','category', categoryNames.map((label, index) => [String(index), label])],
    ['Level','level',[['Beginner','Beginner'],['Intermediate','Intermediate']]],
    ['Duration','duration',[['short','Up to 6 months'],['long','More than 6 months']]],
    ['Fee range','fee',[['low','Up to ₹15,000'],['mid','₹15,001 to ₹35,000'],['high','Above ₹35,000']]],
    ['Sort','sort',[['low','Price low to high'],['high','Price high to low']]],
  ]
  return <><PageIntro tag="PROGRAMME CATALOGUE" title="Explore courses" copy="Find an online programme by subject, duration, budget or learning level. Compare up to three options."/><section className="wrap section catalogue"><div className="filter-box"><label className="search"><Search size={19}/><span className="sr-only">Search courses</span><input type="search" placeholder="Search AI, Python, UPSC, banking…" value={field('q')} onChange={e => change('q',e.target.value)}/></label><div className="filters">{filters.map(([label,key,options]) => <label key={key}>{label}<select value={field(key)} onChange={e => change(key,e.target.value)}><option value="">{key === 'sort' ? 'Featured first' : 'All'}</option>{options.map(([value,name]) => <option key={value} value={value}>{name}</option>)}</select></label>)}</div></div><div className="results"><p aria-live="polite">{matching.length} {matching.length === 1 ? 'programme' : 'programmes'}</p><button className="text-link" onClick={() => setParams({})}>Clear filters</button></div>{comparison.length > 0 && <div className="comparison"><div className="section-head"><h2>Course comparison</h2><button className="text-link" onClick={() => setSelected([])}>Clear comparison</button></div><div className="comparison-grid">{comparison.map(course => <div key={course.title}><strong>{course.title}</strong><p>{fee(course)} · {duration(course)} · {course.level}</p><p>{course.eligibility}</p></div>)}</div></div>}{matching.length ? <Cards items={matching} selected={selected} compare={id => setSelected(previous => previous.includes(id) ? previous.filter(item => item !== id) : previous.length < 3 ? [...previous,id] : previous)}/> : <div className="empty"><Search/><h2>No courses match your filters</h2><button className="btn secondary" onClick={() => setParams({})}>Clear filters</button></div>}</section></>
}

function PageIntro({ tag, title, copy, children }: { tag: string; title: string; copy: string; children?: ReactNode }) {
  return <section className="page-intro"><div className="wrap"><span className="section-tag">{tag}</span><h1>{title}</h1><p>{copy}</p>{children}</div></section>
}

function CourseDetail() {
  const { id } = useParams()
  const course = courses.find(item => item.slug === id)
  useEffect(() => { if (course) document.title = course.title + ' | Learn Anything Academy' }, [course])
  if (!course) return <Missing/>
  return <><PageIntro tag={categoryNames[course.category]} title={course.title} copy={course.description}><div className="actions"><Counsellor kind="primary"/><Counsellor>Request Counselling</Counsellor></div></PageIntro><section className="wrap section split details"><div><Link className="text-link" to={categoryUrl(course.category)}>← Back to courses</Link><h2>Curriculum</h2><ul className="modules">{course.curriculum.map(topic => <li key={topic}>{topic}</li>)}</ul><h2>Learning outcomes</h2><p>{course.description} Practise applying {course.curriculum.slice(0,3).join(', ')} to subject-specific exercises.</p><h2>Who it's for</h2><p>{course.category < 5 ? 'Learners developing skills in ' : 'Aspirants preparing in '}{categoryNames[course.category]}.</p></div><aside className="detail-summary"><h2>{fee(course)}</h2><p>Demonstration programme fee</p><dl><dt>Duration</dt><dd>{duration(course)}</dd><dt>Level</dt><dd>{course.level}</dd><dt>Languages</dt><dd>{course.languages.join(', ')}</dd><dt>Eligibility</dt><dd>{course.eligibility}</dd><dt>Mode</dt><dd>Online</dd></dl></aside></section><section className="soft"><div className="wrap section"><h2>Related courses</h2><Cards items={courses.filter(item => item !== course && (item.category === course.category || item.category < 5 && course.category < 5)).sort((a,b) => Number(b.category === course.category)-Number(a.category === course.category)).slice(0,3)}/></div></section></>
}

const pathways = {
  technology: { title:'Learn technology by building', copy:'Explore artificial intelligence, data science, software development, cloud and cybersecurity.', ids:[0,1,2,3,4], note:'Suggested learning path', path:'Python → Data Analytics → Data Science → Machine Learning → Generative AI' },
  civil: { title:'Prepare for civil services', copy:'Explore UPSC and State PCS programmes from foundations to interview guidance.', ids:[5,6], note:'UPSC preparation stages', path:'Preliminary Examination → Main Examination → Personality Test. Check UPSC for current official eligibility and dates.' },
  government: { title:'Prepare for government exams', copy:'Find preparation for SSC, banking, railways, defence and state-level examinations.', ids:[7,6], note:'Plan your preparation', path:'Choose your target examination, practise core subjects and review timed mock tests.' }
}

function Pathway({ type }: { type: keyof typeof pathways }) {
  const config = pathways[type]
  return <><PageIntro tag="LEARNING PATHWAYS" title={config.title} copy={config.copy}><Counsellor kind="primary"/></PageIntro><section className="wrap section"><CategoryLinks ids={config.ids}/><div className="path-note"><h2>{config.note}</h2><p>{config.path}</p>{type === 'civil' && <p>Independent preparation programmes. <a href="https://upsc.gov.in/">Official UPSC website</a></p>}</div><h2>Explore programmes</h2><Cards items={courses.filter(course => config.ids.includes(course.category))}/></section></>
}

function Info({ page }: { page: 'about' | 'contact' | 'privacy' | 'terms' }) {
  const titles = { about:'About Learn Anything Academy', contact:'Contact and counselling', privacy:'Privacy policy', terms:'Terms and educational disclaimer' }
  return <><PageIntro tag="LEARN ANYTHING ACADEMY" title={titles[page]} copy={page === 'about' ? academy.overview : page === 'contact' ? 'Ask about courses, compare your options or request time with a counsellor.' : 'Information for visitors to this demonstration website.'}/><section className="wrap section prose">
  {page === 'about' && <><h2>Our mission</h2><p>To make quality education and personalised learning guidance accessible to every ambitious learner.</p><h2>Our vision</h2><p>To create a multidisciplinary platform that helps people build meaningful careers and achieve their educational goals.</p><h2>How we approach learning</h2><p>We pair structured learning paths and practical preparation with AI-assisted course guidance through VoxTroop.</p><CategoryLinks ids={[0,1,2,3,4,5,6,7,8]}/></>}
  {page === 'contact' && <><p>Demonstration enquiry address: hello@learnanything.example.</p><div className="actions"><Counsellor kind="primary"/><Counsellor>Request Counselling</Counsellor></div><h2>Frequently asked questions</h2><FAQs/></>}
  {page === 'privacy' && <><h2>Counselling and contact details</h2><p>VoxTroop processes messages, voluntarily shared contact details, appointment requests and optional microphone input to provide counselling. Conversations and bookings may be stored in the Academy's VoxTroop workspace. Share only information relevant to your enquiry.</p><h2>Course browsing</h2><p>The Academy uses the URL to maintain catalogue filter selections. Course comparison selections are held in the current page.</p></>}
  {page === 'terms' && <><h2>Demonstration programmes</h2><p>Course fees, durations and descriptions are illustrative. Payments and enrolment are unavailable. Verify exam dates and eligibility with the relevant official examination authority.</p><h2>Educational guidance</h2><p>The Academy is independent of examination authorities. Course guidance carries no guarantee of placement, salary, examination selection or accreditation.</p></>}
  </section></>
}

function Missing() {
  return <PageIntro tag="PAGE UNAVAILABLE" title="We couldn't find that page" copy="Browse the catalogue to find a programme."><Link className="btn primary" to="/courses">Explore courses <ArrowRight size={18}/></Link></PageIntro>
}

export default function App() {
  const { pathname } = useLocation()
  useEffect(() => { void loadCounsellor().catch(() => {}) }, [])
  useEffect(() => {
    window.scrollTo(0,0)
    if (!pathname.startsWith('/courses/')) {
      const label = nav.find(([,url]) => url === pathname)?.[0]
      document.title = pathname === '/' ? 'Learn Anything Academy | Technology, UPSC & Career Education' : (label || 'Information') + ' | Learn Anything Academy'
    }
  }, [pathname])
  return <><Header/><main id="main"><Routes><Route index element={<Home/>}/><Route path="/courses" element={<Catalogue/>}/><Route path="/courses/:id" element={<CourseDetail/>}/><Route path="/technology" element={<Pathway type="technology"/>}/><Route path="/civil-services" element={<Pathway type="civil"/>}/><Route path="/government-exams" element={<Pathway type="government"/>}/><Route path="/about" element={<Info page="about"/>}/><Route path="/contact" element={<Info page="contact"/>}/><Route path="/privacy" element={<Info page="privacy"/>}/><Route path="/terms" element={<Info page="terms"/>}/><Route path="*" element={<Missing/>}/></Routes></main><Footer/></>
}
