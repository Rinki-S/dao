import { useEffect, useState } from 'react'
import { createWorkspace, listWorkspaces } from '../api.js'

export function WorkspacePanel() {
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
    )
}