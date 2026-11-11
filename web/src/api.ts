export type DrawingFile = { id: number; format: string; filename: string; size: number }
export type Drawing = { id: number; title: string; drawnOn: string; files: DrawingFile[] }

export async function getDrawings(): Promise<Drawing[]> {
  const res = await fetch('/api/drawings')
  // In dev Vite serves the page without auth, so the API is where a missing login shows up.
  if (res.status === 401) location.assign('/api/login')
  if (!res.ok) throw new Error(`server error ${res.status}`)
  return res.json()
}

// drawnOn is a plain date (YYYY-MM-DD); parse it as local time so it doesn't shift a day.
export const formatDay = (drawnOn: string) =>
  new Date(`${drawnOn}T00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
