import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, CheckCircle2, ClipboardCheck, Clock3, FolderOpen, Plus, RefreshCw, Search, XCircle } from 'lucide-react'
import CollectionLinkGenerator from '../components/collections/CollectionLinkGenerator'
import PageHeader from '../components/ui/PageHeader'
import { ListSkeleton } from '../components/ui/Skeleton'
import { getTestLabels, testColors, testDate } from '../components/tests/testPresentation'
import { getTestStats, listTests, type TestRequest, type TestStatus } from '../api/tests'

export default function TestListPage() {
  const { t, i18n } = useTranslation()
  const labels = getTestLabels(t)
  const [items, setItems] = useState<TestRequest[]>([])
  const [stats, setStats] = useState<{ total: number; active: number; by_status: Partial<Record<TestStatus, number>> }>({ total: 0, active: 0, by_status: {} })
  const [filter, setFilter] = useState('')
  const [query, setQuery] = useState('')
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    const params: Record<string, string> = {}
    if (filter) params.status_filter = filter
    if (query.trim()) params.q = query.trim()
    Promise.all([listTests(params), getTestStats()]).then(([requests, summary]) => {
      if (active) { setItems(requests); setStats(summary) }
    }).catch(() => { if (active) setError('test_pages.load_tests_failed') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filter, query, revision])
  const cards = [
    { name: t('test_pages.all_requests'), value: stats.total, icon: ClipboardCheck, color: 'text-[var(--primary)]', hint: t('test_pages.all_requests_hint') },
    { name: t('test_pages.pending'), value: stats.active, icon: Clock3, color: 'text-amber-600', hint: t('test_pages.pending_hint', { submitted: stats.by_status.submitted || 0, testing: stats.by_status.testing || 0 }) },
    { name: t('test_pages.passed'), value: stats.by_status.passed || 0, icon: CheckCircle2, color: 'text-emerald-600', hint: t('test_pages.passed_hint') },
    { name: t('test_pages.needs_fix'), value: stats.by_status.failed || 0, icon: XCircle, color: 'text-red-500', hint: t('test_pages.needs_fix_hint') },
  ]
  return <div className="page-enter space-y-4">
    <PageHeader icon={ClipboardCheck} title={t('test_pages.title')} subtitle={t('test_pages.subtitle')} actions={<div className="flex gap-2"><button aria-label={t('test_pages.refresh_list')} className="btn btn-outline btn-sm" onClick={() => setRevision(value => value + 1)}><RefreshCw size={13}/>{t('test_pages.refresh')}</button><Link to="/tests/new" className="btn btn-primary btn-sm"><Plus size={14}/>{t('test_pages.create')}</Link></div>}/>
    <CollectionLinkGenerator kind="test" />
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{cards.map(card => <div key={card.name} className="panel p-4"><div className="flex items-center justify-between"><span className="text-xs text-[var(--text-muted)]">{card.name}</span><card.icon size={17} className={card.color}/></div><p className="mt-3 text-3xl font-semibold tracking-tight">{card.value}</p><p className="mt-2 text-[11px] text-[var(--text-faint)]">{card.hint}</p></div>)}</div>
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-light)] p-4"><div><h2 className="text-sm font-semibold">{t('test_pages.workbench')} <span className="ws-count">{items.length}</span></h2><p className="mt-1 text-xs text-[var(--text-muted)]">{t('test_pages.workbench_hint')}</p></div><div className="relative w-full sm:w-64"><Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"/><input type="search" aria-label={t('test_pages.search')} placeholder={t('test_pages.search_placeholder')} className="input input-with-icon" value={query} onChange={event => setQuery(event.target.value)}/></div></div>
      <div className="flex flex-wrap gap-1.5 border-b border-[var(--border-light)] bg-[var(--bg-muted)]/40 px-4 py-3">{([['', t('test_pages.all')], ...Object.entries(labels)] as [string, string][]).map(([key, label]) => <button key={key} aria-pressed={filter === key} className={`btn btn-sm ${filter === key ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(key)}>{label}<span className="ml-1 text-[10px] opacity-65">{key ? stats.by_status[key as TestStatus] || 0 : stats.total}</span></button>)}</div>
      {error && <p role="alert" className="p-4 text-sm text-red-600">{t(error)}</p>}
      {loading ? <div className="p-4"><ListSkeleton rows={5}/></div> : <>
        <div className="hidden grid-cols-[minmax(0,1fr)_120px_110px_120px_24px] gap-4 border-b border-[var(--border-light)] px-5 py-2 text-[11px] text-[var(--text-faint)] md:grid"><span>{t('test_pages.request_objective')}</span><span>{t('test_pages.current_status')}</span><span>{t('test_pages.tester')}</span><span>{t('test_pages.updated')}</span><span/></div>
        <div className="divide-y divide-[var(--border-light)]">{items.map(item => <Link to={`/tests/${item.id}`} key={item.id} className="group grid items-center gap-3 px-5 py-4 transition-colors hover:bg-[var(--bg-hover)] md:grid-cols-[minmax(0,1fr)_120px_110px_120px_24px]"><div className="min-w-0"><p className="truncate text-sm font-semibold group-hover:text-[var(--primary)]">{item.title}</p><p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]"><FolderOpen size={11}/>{item.objective ? t('test_pages.objective_filled') : t('test_pages.objective_missing')}<span className="mx-1">·</span>{item.reporter?.display_name || t('test_pages.request')}</p></div><div><span className={`chip ${testColors[item.status]}`}>{labels[item.status]}</span></div><p className="text-xs text-[var(--text-muted)]">{item.tester?.display_name || t('test_pages.unassigned')}</p><time className="text-[11px] text-[var(--text-faint)]">{testDate(item.updated_at, i18n.resolvedLanguage || i18n.language)}</time><ArrowUpRight size={15} className="hidden text-[var(--text-faint)] group-hover:text-[var(--primary)] md:block"/></Link>)}{items.length === 0 && !error && <div className="flex flex-col items-center gap-2 p-12 text-center"><ClipboardCheck size={28} className="text-[var(--text-faint)]"/><p className="mt-2 text-sm font-medium">{t('test_pages.empty')}</p><p className="text-xs text-[var(--text-muted)]">{t('test_pages.empty_hint')}</p><Link to="/tests/new" className="btn btn-outline btn-sm mt-2">{t('test_pages.create')}</Link></div>}</div>
      </>}
    </section>
  </div>
}
