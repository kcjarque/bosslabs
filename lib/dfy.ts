/**
 * DFY (Done-For-You) Ops — typed CRUD for the kanban + per-project detail.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const DFY_LANES = [
  'lite',
  'contract',
  'production',
  'feedback',
  'launch',
  'maintenance',
] as const;
export type DfyLane = (typeof DFY_LANES)[number];

export const DFY_LANE_LABEL: Record<DfyLane, string> = {
  lite: 'MVP (Lite)',
  contract: 'Contract Signature',
  production: 'MVP (Full Production)',
  feedback: 'Feedback Loop',
  launch: 'Launch',
  maintenance: 'Maintenance',
};

export type DfyVision = {
  goal?: string;
  targetUsers?: string;
  keyFeatures?: string;
  additionalNotes?: string;
};

export type DfyBuildStep = {
  slug: string;
  label: string;
  checkedAt: string | null;
  checkedBy: string | null;
};

export type DfyProject = {
  id: string;
  signupId: string | null;
  customerName: string;
  projectName: string;
  lane: DfyLane;
  position: number;
  archived: boolean;
  vision: DfyVision;
  gitUrl: string;
  stagingUrl: string;
  prodUrl: string;
  buildSteps: DfyBuildStep[];
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type DfyComment = {
  id: string;
  projectId: string;
  author: string;
  body: string;
  createdAt: string;
};

export type DfyFile = {
  id: string;
  projectId: string;
  name: string;
  kind: 'contract' | 'vision' | 'design' | 'other';
  storagePath: string | null;
  externalUrl: string | null;
  mime: string | null;
  sizeBytes: number | null;
  uploadedBy: string | null;
  uploadedAt: string;
  /** Computed: public URL if storage-backed, else the external URL. */
  url: string;
};

type DfyProjectRow = {
  id: string;
  signup_id: string | null;
  customer_name: string;
  project_name: string | null;
  lane: DfyLane;
  position: number;
  archived: boolean;
  vision: DfyVision | null;
  git_url: string | null;
  staging_url: string | null;
  prod_url: string | null;
  build_steps: DfyBuildStep[] | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function rowToProject(r: DfyProjectRow): DfyProject {
  return {
    id: r.id,
    signupId: r.signup_id,
    customerName: r.customer_name,
    projectName: r.project_name ?? '',
    lane: r.lane,
    position: r.position,
    archived: r.archived,
    vision: r.vision ?? {},
    gitUrl: r.git_url ?? '',
    stagingUrl: r.staging_url ?? '',
    prodUrl: r.prod_url ?? '',
    buildSteps: r.build_steps ?? [],
    notes: r.notes ?? '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

type ProjectPatch = Partial<{
  signupId: string | null;
  customerName: string;
  projectName: string;
  lane: DfyLane;
  position: number;
  archived: boolean;
  vision: DfyVision;
  gitUrl: string;
  stagingUrl: string;
  prodUrl: string;
  buildSteps: DfyBuildStep[];
  notes: string;
}>;

function toRowPatch(p: ProjectPatch): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  if (p.signupId !== undefined) r.signup_id = p.signupId;
  if (p.customerName !== undefined) r.customer_name = p.customerName;
  if (p.projectName !== undefined) r.project_name = p.projectName || null;
  if (p.lane !== undefined) r.lane = p.lane;
  if (p.position !== undefined) r.position = p.position;
  if (p.archived !== undefined) r.archived = p.archived;
  if (p.vision !== undefined) r.vision = p.vision;
  if (p.gitUrl !== undefined) r.git_url = p.gitUrl || null;
  if (p.stagingUrl !== undefined) r.staging_url = p.stagingUrl || null;
  if (p.prodUrl !== undefined) r.prod_url = p.prodUrl || null;
  if (p.buildSteps !== undefined) r.build_steps = p.buildSteps;
  if (p.notes !== undefined) r.notes = p.notes || null;
  r.updated_at = new Date().toISOString();
  return r;
}

export async function createProject(input: {
  customerName: string;
  signupId?: string | null;
  projectName?: string;
  lane?: DfyLane;
}): Promise<DfyProject | null> {
  if (!isSupabaseConfigured()) return null;
  const row = toRowPatch({
    customerName: input.customerName,
    signupId: input.signupId ?? null,
    projectName: input.projectName ?? '',
    lane: input.lane ?? 'lite',
    position: Date.now(), // monotonically increasing so new cards land at the bottom
  });
  delete row.updated_at;
  const { data, error } = await getSupabase()
    .from('dfy_projects')
    .insert(row)
    .select('*')
    .single();
  if (error) throw new Error(`createProject: ${error.message}`);
  return rowToProject(data as DfyProjectRow);
}

export async function updateProject(id: string, patch: ProjectPatch): Promise<DfyProject | null> {
  if (!isSupabaseConfigured()) return null;
  const row = toRowPatch(patch);
  const { data, error } = await getSupabase()
    .from('dfy_projects')
    .update(row)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`updateProject: ${error.message}`);
  return rowToProject(data as DfyProjectRow);
}

export async function getProject(id: string): Promise<DfyProject | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabase()
    .from('dfy_projects')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getProject: ${error.message}`);
  return data ? rowToProject(data as DfyProjectRow) : null;
}

export async function listProjects(opts: { includeArchived?: boolean } = {}): Promise<DfyProject[]> {
  if (!isSupabaseConfigured()) return [];
  let q = getSupabase()
    .from('dfy_projects')
    .select('*')
    .order('lane', { ascending: true })
    .order('position', { ascending: true });
  if (!opts.includeArchived) q = q.eq('archived', false);
  const { data, error } = await q;
  if (error) throw new Error(`listProjects: ${error.message}`);
  return (data as DfyProjectRow[]).map(rowToProject);
}

export async function deleteProject(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase().from('dfy_projects').delete().eq('id', id);
  if (error) throw new Error(`deleteProject: ${error.message}`);
}

// --- Comments ----------------------------------------------------------------

export async function listComments(projectId: string): Promise<DfyComment[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from('dfy_comments')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`listComments: ${error.message}`);
  return (data as Array<{ id: string; project_id: string; author: string; body: string; created_at: string }>).map((r) => ({
    id: r.id,
    projectId: r.project_id,
    author: r.author,
    body: r.body,
    createdAt: r.created_at,
  }));
}

export async function addComment(projectId: string, author: string, body: string): Promise<DfyComment | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabase()
    .from('dfy_comments')
    .insert({ project_id: projectId, author, body })
    .select('*')
    .single();
  if (error) throw new Error(`addComment: ${error.message}`);
  return {
    id: data.id,
    projectId: data.project_id,
    author: data.author,
    body: data.body,
    createdAt: data.created_at,
  };
}

// --- Files -------------------------------------------------------------------

const FILE_BUCKET = 'email-assets'; // reusing existing public bucket
const FILE_PREFIX = 'dfy';

function bucketPublicUrl(storagePath: string): string {
  // Match upload-receipt's getPublicUrl shape; we resolve at read time so the
  // URL never has to be persisted (and stays correct if the bucket renames).
  return getSupabase().storage.from(FILE_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

type DfyFileRow = {
  id: string;
  project_id: string;
  name: string;
  kind: 'contract' | 'vision' | 'design' | 'other';
  storage_path: string | null;
  external_url: string | null;
  mime: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
};

function rowToFile(r: DfyFileRow): DfyFile {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    kind: r.kind,
    storagePath: r.storage_path,
    externalUrl: r.external_url,
    mime: r.mime,
    sizeBytes: r.size_bytes,
    uploadedBy: r.uploaded_by,
    uploadedAt: r.uploaded_at,
    url: r.storage_path ? bucketPublicUrl(r.storage_path) : (r.external_url ?? ''),
  };
}

export async function listFiles(projectId: string): Promise<DfyFile[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from('dfy_files')
    .select('*')
    .eq('project_id', projectId)
    .order('uploaded_at', { ascending: false });
  if (error) throw new Error(`listFiles: ${error.message}`);
  return (data as DfyFileRow[]).map(rowToFile);
}

export async function uploadFileToBucket(
  projectId: string,
  rawName: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<{ storagePath: string; size: number }> {
  if (!isSupabaseConfigured()) throw new Error('Storage not configured');
  const ext = (rawName.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const key = `${FILE_PREFIX}/${projectId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await getSupabase()
    .storage.from(FILE_BUCKET)
    .upload(key, bytes, { contentType, upsert: false });
  if (error) throw new Error(`uploadFileToBucket: ${error.message}`);
  return { storagePath: key, size: bytes.byteLength };
}

export async function registerFile(input: {
  projectId: string;
  name: string;
  kind: DfyFile['kind'];
  storagePath?: string | null;
  externalUrl?: string | null;
  mime?: string | null;
  sizeBytes?: number | null;
  uploadedBy?: string | null;
}): Promise<DfyFile | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabase()
    .from('dfy_files')
    .insert({
      project_id: input.projectId,
      name: input.name,
      kind: input.kind,
      storage_path: input.storagePath ?? null,
      external_url: input.externalUrl ?? null,
      mime: input.mime ?? null,
      size_bytes: input.sizeBytes ?? null,
      uploaded_by: input.uploadedBy ?? null,
    })
    .select('*')
    .single();
  if (error) throw new Error(`registerFile: ${error.message}`);
  return rowToFile(data as DfyFileRow);
}

export async function deleteFile(fileId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  // Look up the storage_path first so we can remove the blob too.
  const { data } = await getSupabase()
    .from('dfy_files')
    .select('storage_path')
    .eq('id', fileId)
    .maybeSingle();
  if (data?.storage_path) {
    await getSupabase().storage.from(FILE_BUCKET).remove([data.storage_path]);
  }
  const { error } = await getSupabase().from('dfy_files').delete().eq('id', fileId);
  if (error) throw new Error(`deleteFile: ${error.message}`);
}
