import { useEffect, useState } from 'react'
import './App.css'
import { listWorkspaces } from './features/workspaces/api'

function App() {
  const [workspaces, setWorkspaces] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadWorkspaces() {
      try {
        setStatus('loading')
        const nextWorkspaces = await listWorkspaces()

        if (!cancelled) {
          setWorkspaces(nextWorkspaces)
          setStatus('ready')
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load workspaces')
          setStatus('error')
        }
      }
    }

    loadWorkspaces()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className='app-shell'>
      <aside className='sidebar'>
        <div className='brand'>dao</div>
        <nav>
          <a href='#dashboard'>Dashboard</a>
          <a href='#projects'>Projects</a>
          <a href='#tasks'>Tasks</a>
          <a href='#notes'>Notes</a>
          <a href='#settings'>Settings</a>
        </nav>
      </aside>

      <section className='content'>
        <p className='eyebrow'>Local-first developer workspace</p>
        <h1>Dao</h1>
        <p className='lede'>
          A calm workspace for projects, tasks, notes, and long-term developer growth.
        </p>

        <section className='panel'>
          <h2>Workspaces</h2>

          {status === 'loading' && <p>Loading workspaces...</p>}

          {status === 'error' && <p className='error'>Error: {error}</p>}

          {status === 'ready' && workspaces.length === 0 && (
            <p>No workspaces yet.</p>
          )}

          {status === 'ready' && workspaces.length > 0 && (
            <ul className='workspace-list'>
              {workspaces.map((workspace) => (
                <li key={workspace.id}>
                  <strong>{workspace.name}</strong>
                  <span>{workspace.description || 'No description'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  )
}

export default App
