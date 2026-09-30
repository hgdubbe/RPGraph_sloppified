export interface PublicAccount {
  id: string
  alias: string
  protected: boolean
  shared: boolean
  protectionChangePending?: true
}

/** Public summaries only. Keys and filesystem paths never cross this interface. */
export interface AccountAPI {
  loadPreferences(): Promise<Record<string, string>>
  savePreferences(values: Record<string, string>): Promise<void>
  list(): Promise<PublicAccount[]>
  status(): Promise<{ account: PublicAccount | null; legacyAvailable?: boolean }>
  create(options: { alias: string; password?: string }): Promise<PublicAccount>
  migrate(options: { alias: string; password?: string }): Promise<PublicAccount | null>
  unlock(options: { id: string; password?: string }): Promise<PublicAccount>
  import(options: { alias: string; protection: 'password' | 'open'; password?: string; archivePassword?: string }): Promise<PublicAccount | null>
  lock(): Promise<void>
  export(): Promise<boolean>
  rename(options: { id: string; alias: string; password?: string }): Promise<PublicAccount>
  changeProtection(options: { id: string; currentPassword?: string; newPassword?: string }): Promise<PublicAccount>
  remove(options: { id: string; password?: string }): Promise<void>
  recover(options: { id: string; password: string }): Promise<PublicAccount>
}
