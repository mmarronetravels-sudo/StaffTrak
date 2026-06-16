import { supabase } from '../supabaseClient'

// ============================================================
// Supabase Storage helpers for the private 'evidence' bucket (Phase 2b #11).
// Path convention: {tenant_id}/{staff_id}/{subdir}/{uuid}-{safeName}
// Tenant is the first folder so the tenant-scoped storage RLS (migration 014)
// can authorize. Files are private; reads go through short-lived signed URLs.
// ============================================================

const BUCKET = 'evidence'

// Strip path separators / odd chars from a filename for a clean object key.
function safeName(name) {
  return (name || 'file').replace(/[^\w.-]+/g, '_').slice(-120)
}

function randomId() {
  return (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`)
}

/**
 * Upload a File to the evidence bucket.
 * @returns { path, error } — path is the stored object key (save to file_path).
 */
export async function uploadEvidenceFile(file, { tenantId, staffId, subdir = 'evidence' }) {
  if (!file) return { path: null, error: new Error('No file') }
  if (!tenantId || !staffId) return { path: null, error: new Error('Missing tenant/staff') }
  const path = `${tenantId}/${staffId}/${subdir}/${randomId()}-${safeName(file.name)}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined })
  if (error) return { path: null, error }
  return { path, error: null }
}

/** Mint a short-lived signed URL for a stored object path. */
export async function signedUrl(path, expiresInSeconds = 120) {
  if (!path) return { url: null, error: new Error('No path') }
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds)
  return { url: data?.signedUrl || null, error }
}

/** Best-effort delete of a stored object. */
export async function removeEvidenceFile(path) {
  if (!path) return
  try {
    await supabase.storage.from(BUCKET).remove([path])
  } catch {
    /* ignore — orphaned object is harmless */
  }
}

/** Open a stored file in a new tab via a signed URL. */
export async function openEvidenceFile(path) {
  const { url, error } = await signedUrl(path)
  if (error || !url) {
    alert(`Could not open file: ${error?.message || 'unknown error'}`)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}
