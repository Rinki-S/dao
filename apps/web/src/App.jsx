import { useEffect, useState } from 'react'
import { createWorkspace, listWorkspaces } from './features/workspaces/api.js'

function App() {
  const [workspaces, setWorkspaces] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [workspaceDescription, setWorkspaceDescription] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  async function loadWorkspaces() {
    setStatus('loading')
    setError('')

    const nextWorkspaces = await listWorkspaces()

    setWorkspaces(nextWorkspaces)
    setStatus('ready')
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        setStatus('loading')
        setError('')

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

    load()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleCreateWorkspace(event) {
    event.preventDefault()

    try {
      setIsCreating(true)
      setError('')

      await createWorkspace({
        name: workspaceName,
        description: workspaceDescription,
      })

      setWorkspaceName('')
      setWorkspaceDescription('')
      await loadWorkspaces()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace')
      setStatus('error')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#F7F4ED] text-[#2B2F36]">
      <div className="grid min-h-screen grid-cols-[240px_1fr]">
        <aside className="border-r border-[#E5E7EB] bg-white px-5 py-6">
          <div className="mb-8 text-xl font-semibold tracking-normal">
            <span>dao</span>
            <span className="text-[#00A86B]">.</span>
          </div>

          <nav className="grid gap-1 text-sm text-[#6B7280]">
            {['Dashboard', 'Projects', 'Tasks', 'Notes', 'Search', 'Settings'].map((item) => (
              <a
                key={item}
                className="rounded-md px-3 py-2 hover:bg-[#F2EFE8] hover:text-[#2B2F36]"
                href={`#${item.toLowerCase()}`}
              >
                {item}
              </a>
            ))}
          </nav>
        </aside>

        <section className="px-8 py-7">
          <div className="mb-8 max-w-3xl">
            <p className="mb-2 text-xs font-medium uppercase text-[#00A86B]">
              Local-first developer workspace
            </p>
            <h1 className="text-3xl font-semibold tracking-normal text-[#111827]">
              Dao
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6B7280]">
              A calm workspace for projects, tasks, notes, and long-term developer growth.
            </p>
          </div>

          <section className="max-w-3xl rounded-lg border border-[#E5E7EB] bg-white p-5">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-[#111827]">Workspaces</h2>
                <p className="mt-1 text-sm text-[#6B7280]">
                  Create the first local container for Dao.
                </p>
              </div>
            </div>

            <form className="mb-5 grid gap-3" onSubmit={handleCreateWorkspace}>
              <input
                className="rounded-md border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:border-[#00A86B] focus:ring-3 focus:ring-[rgba(0,168,107,0.18)]"
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
                placeholder="Workspace name"
              />
              <input
                className="rounded-md border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:border-[#00A86B] focus:ring-3 focus:ring-[rgba(0,168,107,0.18)]"
                value={workspaceDescription}
                onChange={(event) => setWorkspaceDescription(event.target.value)}
                placeholder="Description"
              />
              <button
                className="w-fit rounded-md bg-[#00A86B] px-4 py-2 text-sm font-medium text-white hover:bg-[#34C38F] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isCreating}
                type="submit"
              >
                {isCreating ? 'Creating...' : 'Create workspace'}
              </button>
            </form>

            {status === 'loading' && (
              <p className="text-sm text-[#6B7280]">Loading workspaces...</p>
            )}

            {status === 'error' && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            {status === 'ready' && workspaces.length === 0 && (
              <p className="text-sm text-[#6B7280]">No workspaces yet.</p>
            )}

            {status === 'ready' && workspaces.length > 0 && (
              <ul className="grid gap-2">
                {workspaces.map((workspace) => (
                  <li
                    key={workspace.id}
                    className="rounded-md border border-[#E5E7EB] px-3 py-3"
                  >
                    <strong className="block text-sm font-medium text-[#111827]">
                      {workspace.name}
                    </strong>
                    <span className="mt-1 block text-sm text-[#6B7280]">
                      {workspace.description || 'No description'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>
      </div>
    </main>
  )
}

export default App