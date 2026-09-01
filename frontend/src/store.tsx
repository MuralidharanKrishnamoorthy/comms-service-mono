import { createContext } from 'preact'
import type { ComponentChildren } from 'preact'
import { useCallback, useContext, useEffect, useState } from 'preact/hooks'
import { ApiError, listProjects } from './api'
import type { Project } from './types'

const STORAGE_KEY = 'commsvc.selectedProjectId'

interface Store {
  projects: Project[]
  projectsLoading: boolean
  // true only when the projects fetch failed because the backend was unreachable
  projectsUnreachable: boolean
  selectedProjectId: string | null
  selectedProject: Project | null
  setSelectedProjectId: (id: string | null) => void
  refreshProjects: () => Promise<void>
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ComponentChildren }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projectsUnreachable, setProjectsUnreachable] = useState(false)
  const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  )

  const setSelectedProjectId = useCallback((id: string | null) => {
    setSelectedProjectIdState(id)
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  }, [])

  const refreshProjects = useCallback(async () => {
    setProjectsLoading(true)
    try {
      const data = await listProjects()
      setProjects(data)
      setProjectsUnreachable(false)
      // Keep the selection valid; default to the first project if none is chosen.
      setSelectedProjectIdState((current) => {
        if (current && data.some((p) => p._id === current)) return current
        const next = data[0]?._id ?? null
        if (next) localStorage.setItem(STORAGE_KEY, next)
        return next
      })
    } catch (err) {
      if (err instanceof ApiError && err.isNetwork) setProjectsUnreachable(true)
    } finally {
      setProjectsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshProjects()
  }, [refreshProjects])

  const selectedProject =
    projects.find((p) => p._id === selectedProjectId) ?? null

  return (
    <StoreContext.Provider
      value={{
        projects,
        projectsLoading,
        projectsUnreachable,
        selectedProjectId,
        selectedProject,
        setSelectedProjectId,
        refreshProjects,
      }}
    >
      {children}
    </StoreContext.Provider>
  )
}

export function useStore(): Store {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
