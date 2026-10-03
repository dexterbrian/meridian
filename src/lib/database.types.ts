
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "aml_flags": {
                  Row: {
                    "action_taken": string,"business_id": string,"created_at": string,"evidence": NonNullable<Json>,"id": string,"note": string | null,"resolved_at": string | null,"resolved_by": string | null,"rule": string,"severity": string,"status": string,"transaction_id": string | null
                  }
                  Insert: {
                    "action_taken": string,"business_id": string,"created_at"?: string,"evidence"?: NonNullable<Json>,"id"?: string,"note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"rule": string,"severity": string,"status"?: string,"transaction_id"?: string | null
                  }
                  Update: {
                    "action_taken"?: string,"business_id"?: string,"created_at"?: string,"evidence"?: NonNullable<Json>,"id"?: string,"note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"rule"?: string,"severity"?: string,"status"?: string,"transaction_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "aml_flags_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "aml_flags_transaction_id_fkey"
      columns: ["transaction_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id"]
    }
                  ]
                },"businesses": {
                  Row: {
                    "address": string | null,"contact_email": string | null,"contact_phone": string | null,"country": string,"created_at": string,"id": string,"kyb_status": string,"name": string,"owner_user_id": string,"registration_number": string | null,"review_note": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"risk_level": string,"tax_number": string | null,"tier": number,"tier3_monthly_limit_usd": number | null,"tier3_per_tx_limit_usd": number | null,"trading_name": string | null,"updated_at": string,"website": string | null
                  }
                  Insert: {
                    "address"?: string | null,"contact_email"?: string | null,"contact_phone"?: string | null,"country": string,"created_at"?: string,"id"?: string,"kyb_status"?: string,"name": string,"owner_user_id": string,"registration_number"?: string | null,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"risk_level"?: string,"tax_number"?: string | null,"tier"?: number,"tier3_monthly_limit_usd"?: number | null,"tier3_per_tx_limit_usd"?: number | null,"trading_name"?: string | null,"updated_at"?: string,"website"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"contact_email"?: string | null,"contact_phone"?: string | null,"country"?: string,"created_at"?: string,"id"?: string,"kyb_status"?: string,"name"?: string,"owner_user_id"?: string,"registration_number"?: string | null,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"risk_level"?: string,"tax_number"?: string | null,"tier"?: number,"tier3_monthly_limit_usd"?: number | null,"tier3_per_tx_limit_usd"?: number | null,"trading_name"?: string | null,"updated_at"?: string,"website"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"contact_messages": {
                  Row: {
                    "company": string | null,"created_at": string,"email": string,"id": string,"message": string,"name": string,"subject": string | null
                  }
                  Insert: {
                    "company"?: string | null,"created_at"?: string,"email": string,"id"?: string,"message": string,"name": string,"subject"?: string | null
                  }
                  Update: {
                    "company"?: string | null,"created_at"?: string,"email"?: string,"id"?: string,"message"?: string,"name"?: string,"subject"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"demo_transactions": {
                  Row: {
                    "amount": number,"created_at": string,"id": string,"kind": string,"memo": string | null,"merchant": string | null,"meridian_fee": number,"paid_at": string | null,"partner_fee": number,"payer_email": string | null,"payer_name": string | null,"receive_currency": string,"recipient_gets": number,"reference": string | null,"send_currency": string,"status": string,"total_fee": number
                  }
                  Insert: {
                    "amount": number,"created_at"?: string,"id"?: string,"kind": string,"memo"?: string | null,"merchant"?: string | null,"meridian_fee"?: number,"paid_at"?: string | null,"partner_fee"?: number,"payer_email"?: string | null,"payer_name"?: string | null,"receive_currency": string,"recipient_gets"?: number,"reference"?: string | null,"send_currency": string,"status"?: string,"total_fee"?: number
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"id"?: string,"kind"?: string,"memo"?: string | null,"merchant"?: string | null,"meridian_fee"?: number,"paid_at"?: string | null,"partner_fee"?: number,"payer_email"?: string | null,"payer_name"?: string | null,"receive_currency"?: string,"recipient_gets"?: number,"reference"?: string | null,"send_currency"?: string,"status"?: string,"total_fee"?: number
                  }
                  Relationships: [
                    
                  ]
                },"partner_calls": {
                  Row: {
                    "created_at": string,"duration_ms": number | null,"endpoint": string,"id": string,"partner": string,"request": Json | null,"response": Json | null,"status_code": number | null,"transaction_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"duration_ms"?: number | null,"endpoint": string,"id"?: string,"partner": string,"request"?: Json | null,"response"?: Json | null,"status_code"?: number | null,"transaction_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"duration_ms"?: number | null,"endpoint"?: string,"id"?: string,"partner"?: string,"request"?: Json | null,"response"?: Json | null,"status_code"?: number | null,"transaction_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"payment_requests": {
                  Row: {
                    "amount": number | null,"attempt_count": number,"business_id": string,"created_at": string,"currency": string,"expires_at": string | null,"id": string,"idempotency_key": string | null,"invoice_number": string | null,"max_amount": number | null,"memo": string | null,"min_amount": number | null,"paid_count": number,"payer_email": string | null,"reference": string,"status": string,"updated_at": string,"usage": string
                  }
                  Insert: {
                    "amount"?: number | null,"attempt_count"?: number,"business_id": string,"created_at"?: string,"currency": string,"expires_at"?: string | null,"id"?: string,"idempotency_key"?: string | null,"invoice_number"?: string | null,"max_amount"?: number | null,"memo"?: string | null,"min_amount"?: number | null,"paid_count"?: number,"payer_email"?: string | null,"reference": string,"status"?: string,"updated_at"?: string,"usage"?: string
                  }
                  Update: {
                    "amount"?: number | null,"attempt_count"?: number,"business_id"?: string,"created_at"?: string,"currency"?: string,"expires_at"?: string | null,"id"?: string,"idempotency_key"?: string | null,"invoice_number"?: string | null,"max_amount"?: number | null,"memo"?: string | null,"min_amount"?: number | null,"paid_count"?: number,"payer_email"?: string | null,"reference"?: string,"status"?: string,"updated_at"?: string,"usage"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_requests_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"payout_accounts": {
                  Row: {
                    "business_id": string,"country": string,"created_at": string,"currency": string,"details": NonNullable<Json>,"id": string,"is_default": boolean,"method": string,"partner": string,"partner_customer_key": string | null,"updated_at": string,"validated": boolean,"validated_name": string | null
                  }
                  Insert: {
                    "business_id": string,"country": string,"created_at"?: string,"currency": string,"details": NonNullable<Json>,"id"?: string,"is_default"?: boolean,"method": string,"partner"?: string,"partner_customer_key"?: string | null,"updated_at"?: string,"validated"?: boolean,"validated_name"?: string | null
                  }
                  Update: {
                    "business_id"?: string,"country"?: string,"created_at"?: string,"currency"?: string,"details"?: NonNullable<Json>,"id"?: string,"is_default"?: boolean,"method"?: string,"partner"?: string,"partner_customer_key"?: string | null,"updated_at"?: string,"validated"?: boolean,"validated_name"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payout_accounts_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"recipients": {
                  Row: {
                    "business_id": string,"country": string,"created_at": string,"currency": string,"details": NonNullable<Json>,"first_paid_at": string | null,"id": string,"method": string,"name": string,"partner_refs": NonNullable<Json>,"screened_at": string | null,"screening_result": Json | null,"updated_at": string
                  }
                  Insert: {
                    "business_id": string,"country": string,"created_at"?: string,"currency": string,"details"?: NonNullable<Json>,"first_paid_at"?: string | null,"id"?: string,"method": string,"name": string,"partner_refs"?: NonNullable<Json>,"screened_at"?: string | null,"screening_result"?: Json | null,"updated_at"?: string
                  }
                  Update: {
                    "business_id"?: string,"country"?: string,"created_at"?: string,"currency"?: string,"details"?: NonNullable<Json>,"first_paid_at"?: string | null,"id"?: string,"method"?: string,"name"?: string,"partner_refs"?: NonNullable<Json>,"screened_at"?: string | null,"screening_result"?: Json | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipients_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"transaction_events": {
                  Row: {
                    "created_at": string,"from_status": string | null,"id": string,"idempotency_key": string,"payload": Json | null,"source": string,"to_status": string | null,"transaction_id": string
                  }
                  Insert: {
                    "created_at"?: string,"from_status"?: string | null,"id"?: string,"idempotency_key": string,"payload"?: Json | null,"source": string,"to_status"?: string | null,"transaction_id": string
                  }
                  Update: {
                    "created_at"?: string,"from_status"?: string | null,"id"?: string,"idempotency_key"?: string,"payload"?: Json | null,"source"?: string,"to_status"?: string | null,"transaction_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transaction_events_transaction_id_fkey"
      columns: ["transaction_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id"]
    }
                  ]
                },"transactions": {
                  Row: {
                    "attempt_no": number | null,"business_id": string,"collected_at": string | null,"created_at": string,"failure_reason": string | null,"id": string,"idempotency_key": string | null,"kind": string,"meridian_fee": number,"partner_fee_in": number,"partner_fee_out": number,"partner_fee_reported": number | null,"partner_in": string | null,"partner_in_ref": string | null,"partner_out": string | null,"partner_out_ref": string | null,"pay_method": string,"payer_country": string | null,"payer_email": string | null,"payer_name": string | null,"payer_phone": string | null,"payin_details": Json | null,"payment_request_id": string | null,"payout_account_id": string | null,"payout_reference": string | null,"quote": NonNullable<Json>,"quote_expires_at": string | null,"receive_amount": number,"receive_currency": string,"recipient_id": string | null,"reference": string,"send_amount": number,"send_currency": string,"settled_at": string | null,"status": string,"total_charged": number,"updated_at": string,"usd_equivalent": number
                  }
                  Insert: {
                    "attempt_no"?: number | null,"business_id": string,"collected_at"?: string | null,"created_at"?: string,"failure_reason"?: string | null,"id"?: string,"idempotency_key"?: string | null,"kind"?: string,"meridian_fee"?: number,"partner_fee_in"?: number,"partner_fee_out"?: number,"partner_fee_reported"?: number | null,"partner_in"?: string | null,"partner_in_ref"?: string | null,"partner_out"?: string | null,"partner_out_ref"?: string | null,"pay_method": string,"payer_country"?: string | null,"payer_email"?: string | null,"payer_name"?: string | null,"payer_phone"?: string | null,"payin_details"?: Json | null,"payment_request_id"?: string | null,"payout_account_id"?: string | null,"payout_reference"?: string | null,"quote"?: NonNullable<Json>,"quote_expires_at"?: string | null,"receive_amount": number,"receive_currency": string,"recipient_id"?: string | null,"reference": string,"send_amount": number,"send_currency": string,"settled_at"?: string | null,"status": string,"total_charged": number,"updated_at"?: string,"usd_equivalent"?: number
                  }
                  Update: {
                    "attempt_no"?: number | null,"business_id"?: string,"collected_at"?: string | null,"created_at"?: string,"failure_reason"?: string | null,"id"?: string,"idempotency_key"?: string | null,"kind"?: string,"meridian_fee"?: number,"partner_fee_in"?: number,"partner_fee_out"?: number,"partner_fee_reported"?: number | null,"partner_in"?: string | null,"partner_in_ref"?: string | null,"partner_out"?: string | null,"partner_out_ref"?: string | null,"pay_method"?: string,"payer_country"?: string | null,"payer_email"?: string | null,"payer_name"?: string | null,"payer_phone"?: string | null,"payin_details"?: Json | null,"payment_request_id"?: string | null,"payout_account_id"?: string | null,"payout_reference"?: string | null,"quote"?: NonNullable<Json>,"quote_expires_at"?: string | null,"receive_amount"?: number,"receive_currency"?: string,"recipient_id"?: string | null,"reference"?: string,"send_amount"?: number,"send_currency"?: string,"settled_at"?: string | null,"status"?: string,"total_charged"?: number,"updated_at"?: string,"usd_equivalent"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "transactions_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_payment_request_id_fkey"
      columns: ["payment_request_id"]
isOneToOne: false
      referencedRelation: "payment_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_payout_account_id_fkey"
      columns: ["payout_account_id"]
isOneToOne: false
      referencedRelation: "payout_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "recipients"
      referencedColumns: ["id"]
    }
                  ]
                },"waitlist_signups": {
                  Row: {
                    "business_name": string,"contact_name": string,"country": string | null,"created_at": string,"email": string,"id": string,"monthly_volume": string | null,"pain_point": string | null
                  }
                  Insert: {
                    "business_name": string,"contact_name": string,"country"?: string | null,"created_at"?: string,"email": string,"id"?: string,"monthly_volume"?: string | null,"pain_point"?: string | null
                  }
                  Update: {
                    "business_name"?: string,"contact_name"?: string,"country"?: string | null,"created_at"?: string,"email"?: string,"id"?: string,"monthly_volume"?: string | null,"pain_point"?: string | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"mark_request_paid":
{ Args: { "p_request_id": string }; Returns: {
              "amount": number | null,
"attempt_count": number,
"business_id": string,
"created_at": string,
"currency": string,
"expires_at": string | null,
"id": string,
"idempotency_key": string | null,
"invoice_number": string | null,
"max_amount": number | null,
"memo": string | null,
"min_amount": number | null,
"paid_count": number,
"payer_email": string | null,
"reference": string,
"status": string,
"updated_at": string,
"usage": string
            }
                          SetofOptions: {
        from: "*"
        to: "payment_requests"
        isOneToOne: true
        isSetofReturn: false
      } },
"my_business_ids":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"set_default_payout_account":
{ Args: { "p_account_id": string,"p_business_id": string }; Returns: {
              "business_id": string,
"country": string,
"created_at": string,
"currency": string,
"details": NonNullable<Json>,
"id": string,
"is_default": boolean,
"method": string,
"partner": string,
"partner_customer_key": string | null,
"updated_at": string,
"validated": boolean,
"validated_name": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "payout_accounts"
        isOneToOne: true
        isSetofReturn: false
      } },
"start_collection_attempt":
{ Args: { "p_amount": number,"p_meridian_fee": number,"p_partner_fee": number,"p_pay_method": string,"p_payer": Json,"p_payout_account_id": string,"p_quote": Json,"p_reference": string,"p_total_charged": number,"p_usd_equivalent": number }; Returns: {
              "attempt_no": number | null,
"business_id": string,
"collected_at": string | null,
"created_at": string,
"failure_reason": string | null,
"id": string,
"idempotency_key": string | null,
"kind": string,
"meridian_fee": number,
"partner_fee_in": number,
"partner_fee_out": number,
"partner_fee_reported": number | null,
"partner_in": string | null,
"partner_in_ref": string | null,
"partner_out": string | null,
"partner_out_ref": string | null,
"pay_method": string,
"payer_country": string | null,
"payer_email": string | null,
"payer_name": string | null,
"payer_phone": string | null,
"payin_details": Json | null,
"payment_request_id": string | null,
"payout_account_id": string | null,
"payout_reference": string | null,
"quote": NonNullable<Json>,
"quote_expires_at": string | null,
"receive_amount": number,
"receive_currency": string,
"recipient_id": string | null,
"reference": string,
"send_amount": number,
"send_currency": string,
"settled_at": string | null,
"status": string,
"total_charged": number,
"updated_at": string,
"usd_equivalent": number
            }
                          SetofOptions: {
        from: "*"
        to: "transactions"
        isOneToOne: true
        isSetofReturn: false
      } },
"start_routed_attempt":
{ Args: { "p_meridian_fee": number,"p_partner": string,"p_partner_fee": number,"p_pay_method": string,"p_payer": Json,"p_payout_account_id": string,"p_quote": Json,"p_receive_amount": number,"p_reference": string,"p_send_amount": number,"p_send_currency": string,"p_total_charged": number,"p_usd_equivalent": number }; Returns: {
              "attempt_no": number | null,
"business_id": string,
"collected_at": string | null,
"created_at": string,
"failure_reason": string | null,
"id": string,
"idempotency_key": string | null,
"kind": string,
"meridian_fee": number,
"partner_fee_in": number,
"partner_fee_out": number,
"partner_fee_reported": number | null,
"partner_in": string | null,
"partner_in_ref": string | null,
"partner_out": string | null,
"partner_out_ref": string | null,
"pay_method": string,
"payer_country": string | null,
"payer_email": string | null,
"payer_name": string | null,
"payer_phone": string | null,
"payin_details": Json | null,
"payment_request_id": string | null,
"payout_account_id": string | null,
"payout_reference": string | null,
"quote": NonNullable<Json>,
"quote_expires_at": string | null,
"receive_amount": number,
"receive_currency": string,
"recipient_id": string | null,
"reference": string,
"send_amount": number,
"send_currency": string,
"settled_at": string | null,
"status": string,
"total_charged": number,
"updated_at": string,
"usd_equivalent": number
            }
                          SetofOptions: {
        from: "*"
        to: "transactions"
        isOneToOne: true
        isSetofReturn: false
      } },
"to_base36":
{ Args: { "n": number }; Returns: string
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
