import {
  agreementSchema,
  agreementWorkerSchema,
  type Agreement,
  type AgreementWorker,
  type CreateAgreement,
  jobSchema,
  type Job,
  type CompleteJob,
  type RespondJobCompletion,
} from '@kaampass/contracts'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { AuthenticatedAccount } from '../middleware/authorization.js'
import { ApiError } from '../middleware/error-handler.js'

type AgreementRow = Omit<Agreement, 'employer_name' | 'worker_name'>

export class AgreementService {
  constructor(private readonly client: SupabaseClient) {}

  async listWorkers(): Promise<AgreementWorker[]> {
    const workers = await this.client
      .from('worker_profiles')
      .select('user_id, profession, service_area')
      .order('created_at', { ascending: true })
      .limit(100)
    if (workers.error)
      throw new ApiError(
        503,
        'AGREEMENTS_UNAVAILABLE',
        'Unable to load workers.',
      )

    const names = await this.loadNames(
      workers.data.map((worker) => worker.user_id as string),
    )
    return workers.data.map((worker) =>
      agreementWorkerSchema.parse({
        id: worker.user_id,
        full_name: names.get(worker.user_id as string),
        profession: worker.profession,
        service_area: worker.service_area,
      }),
    )
  }

  async createAgreement(
    employerId: string,
    input: CreateAgreement,
  ): Promise<Agreement> {
    const employer = await this.client
      .from('employer_profiles')
      .select('user_id')
      .eq('user_id', employerId)
      .maybeSingle()
    if (employer.error)
      throw new ApiError(
        503,
        'AGREEMENTS_UNAVAILABLE',
        'Unable to verify the employer profile.',
      )
    if (!employer.data)
      throw new ApiError(
        409,
        'EMPLOYER_PROFILE_REQUIRED',
        'Complete your employer profile before sending an agreement.',
      )

    const worker = await this.client
      .from('worker_profiles')
      .select('user_id, profession')
      .eq('user_id', input.worker_id)
      .maybeSingle()
    if (worker.error)
      throw new ApiError(
        503,
        'AGREEMENTS_UNAVAILABLE',
        'Unable to verify the worker.',
      )
    if (!worker.data)
      throw new ApiError(404, 'WORKER_NOT_FOUND', 'Worker not found.')
    if (worker.data.profession !== input.profession)
      throw new ApiError(
        409,
        'WORKER_PROFESSION_CHANGED',
        'The worker profession changed. Review the terms and try again.',
      )

    const totalMinor =
      input.pricing_model === 'daily_rate'
        ? input.amount_minor * input.work_days
        : input.amount_minor
    const created = await this.client
      .from('work_agreements')
      .insert({
        employer_id: employerId,
        worker_id: input.worker_id,
        profession: input.profession,
        description: input.description,
        work_days: input.work_days,
        pricing_model: input.pricing_model,
        amount_minor: input.amount_minor,
        total_minor: totalMinor,
        currency_code: input.currency_code,
        materials_responsibility: input.materials_responsibility,
        trade_details: input.trade_details,
      })
      .select('*')
      .single()
    if (created.error)
      throw new ApiError(
        503,
        'AGREEMENT_CREATE_FAILED',
        'The agreement could not be created.',
      )
    return this.hydrate(created.data as AgreementRow)
  }

  async listAgreements(account: AuthenticatedAccount): Promise<Agreement[]> {
    const ownerColumn = account.role === 'worker' ? 'worker_id' : 'employer_id'
    const result = await this.client
      .from('work_agreements')
      .select('*')
      .eq(ownerColumn, account.id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (result.error)
      throw new ApiError(
        503,
        'AGREEMENTS_UNAVAILABLE',
        'Unable to load agreements.',
      )
    return this.hydrateMany(result.data as AgreementRow[])
  }

  async listJobs(account: AuthenticatedAccount): Promise<Job[]> {
    const ownerColumn = account.role === 'worker' ? 'worker_id' : 'employer_id'
    const owned = await this.client
      .from('work_agreements')
      .select('*')
      .eq(ownerColumn, account.id)
      .eq('status', 'accepted')
    if (owned.error)
      throw new ApiError(503, 'JOBS_UNAVAILABLE', 'Unable to load your jobs.')
    const agreements = await this.hydrateMany(owned.data as AgreementRow[])
    const byId = new Map(
      agreements.map((agreement) => [agreement.id, agreement]),
    )
    if (byId.size === 0) return []
    const result = await this.client
      .from('jobs')
      .select('*')
      .in('agreement_id', [...byId.keys()])
      .order('created_at', { ascending: false })
    if (result.error)
      throw new ApiError(503, 'JOBS_UNAVAILABLE', 'Unable to load your jobs.')
    return result.data.map((job) =>
      jobSchema.parse({
        ...job,
        agreement: byId.get(job.agreement_id as string),
      }),
    )
  }

  async completeJob(
    account: AuthenticatedAccount,
    jobId: string,
    input: CompleteJob,
  ): Promise<Job> {
    return this.transitionJob(account, jobId, 'complete_job', {
      p_job_id: jobId,
      p_employer_id: account.id,
      p_days: input.completed_days,
      p_paid: input.paid_amount_minor,
    })
  }

  async respondJobCompletion(
    account: AuthenticatedAccount,
    jobId: string,
    input: RespondJobCompletion,
  ): Promise<Job> {
    return this.transitionJob(account, jobId, 'respond_job_completion', {
      p_job_id: jobId,
      p_worker_id: account.id,
      p_confirm: input.confirm,
      p_reason: input.reason,
    })
  }

  private async transitionJob(
    account: AuthenticatedAccount,
    jobId: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<Job> {
    const result = await this.client.rpc(name, args)
    if (result.error)
      throw new ApiError(503, 'JOB_UPDATE_FAILED', 'Unable to update the job.')
    if (result.data === 'not_found')
      throw new ApiError(404, 'JOB_NOT_FOUND', 'Job not found.')
    if (result.data === 'invalid')
      throw new ApiError(
        400,
        'INVALID_JOB_UPDATE',
        'Check the completion details.',
      )
    if (result.data !== 'ok')
      throw new ApiError(
        409,
        'JOB_STATE_CONFLICT',
        'The job status has changed. Refresh and review it.',
      )
    const job = (await this.listJobs(account)).find((item) => item.id === jobId)
    if (!job)
      throw new ApiError(503, 'JOBS_UNAVAILABLE', 'Unable to load your job.')
    return job
  }

  async getAgreement(
    account: AuthenticatedAccount,
    agreementId: string,
  ): Promise<Agreement> {
    const row = await this.loadOwnedRow(account, agreementId)
    return this.hydrate(row)
  }

  async acceptAgreement(workerId: string, agreementId: string) {
    return this.respondToAgreement(workerId, agreementId, 'accepted', null)
  }

  async rejectAgreement(
    workerId: string,
    agreementId: string,
    reason: string | null,
  ) {
    return this.respondToAgreement(workerId, agreementId, 'rejected', reason)
  }

  private async respondToAgreement(
    workerId: string,
    agreementId: string,
    status: 'accepted' | 'rejected',
    rejectionReason: string | null,
  ): Promise<Agreement> {
    const result = await this.client
      .from('work_agreements')
      .update({
        status,
        rejection_reason: rejectionReason,
        responded_at: new Date().toISOString(),
      })
      .eq('id', agreementId)
      .eq('worker_id', workerId)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle()
    if (result.error)
      throw new ApiError(
        503,
        'AGREEMENT_RESPONSE_FAILED',
        'The agreement response could not be saved.',
      )
    if (!result.data) {
      const existing = await this.client
        .from('work_agreements')
        .select('id, status')
        .eq('id', agreementId)
        .eq('worker_id', workerId)
        .maybeSingle()
      if (existing.error)
        throw new ApiError(
          503,
          'AGREEMENTS_UNAVAILABLE',
          'Unable to verify the agreement.',
        )
      if (!existing.data)
        throw new ApiError(404, 'AGREEMENT_NOT_FOUND', 'Agreement not found.')
      throw new ApiError(
        409,
        'AGREEMENT_ALREADY_RESPONDED',
        'This agreement has already been accepted or rejected.',
      )
    }
    return this.hydrate(result.data as AgreementRow)
  }

  private async loadOwnedRow(
    account: AuthenticatedAccount,
    agreementId: string,
  ): Promise<AgreementRow> {
    const ownerColumn = account.role === 'worker' ? 'worker_id' : 'employer_id'
    const result = await this.client
      .from('work_agreements')
      .select('*')
      .eq('id', agreementId)
      .eq(ownerColumn, account.id)
      .maybeSingle()
    if (result.error)
      throw new ApiError(
        503,
        'AGREEMENTS_UNAVAILABLE',
        'Unable to load the agreement.',
      )
    if (!result.data)
      throw new ApiError(404, 'AGREEMENT_NOT_FOUND', 'Agreement not found.')
    return result.data as AgreementRow
  }

  private async hydrate(row: AgreementRow): Promise<Agreement> {
    const names = await this.loadNames([row.employer_id, row.worker_id])
    return agreementSchema.parse({
      ...row,
      employer_name: names.get(row.employer_id),
      worker_name: names.get(row.worker_id),
    })
  }

  private async hydrateMany(rows: AgreementRow[]): Promise<Agreement[]> {
    const names = await this.loadNames(
      rows.flatMap((row) => [row.employer_id, row.worker_id]),
    )
    return rows.map((row) =>
      agreementSchema.parse({
        ...row,
        employer_name: names.get(row.employer_id),
        worker_name: names.get(row.worker_id),
      }),
    )
  }

  private async loadNames(ids: string[]) {
    const uniqueIds = [...new Set(ids)]
    if (uniqueIds.length === 0) return new Map<string, string>()
    const result = await this.client
      .from('profiles')
      .select('id, full_name')
      .in('id', uniqueIds)
    if (result.error)
      throw new ApiError(
        503,
        'AGREEMENTS_UNAVAILABLE',
        'Unable to load participant names.',
      )
    return new Map(
      result.data.map((profile) => [
        profile.id as string,
        profile.full_name as string,
      ]),
    )
  }
}
