export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      annual_budgets: {
        Row: {
          amount: number
          category_id: string | null
          company_id: string | null
          created_at: string | null
          id: string
          month: number | null
          updated_at: string | null
          year: number
        }
        Insert: {
          amount: number
          category_id?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          month?: number | null
          updated_at?: string | null
          year: number
        }
        Update: {
          amount?: number
          category_id?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          month?: number | null
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "annual_budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "annual_budgets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_limits: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          max_amount: number
          role: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          max_amount: number
          role: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          max_amount?: number
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_limits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_logs: {
        Row: {
          action: string | null
          approved_by: string | null
          comment: string | null
          created_at: string | null
          id: string
          transaction_id: string | null
        }
        Insert: {
          action?: string | null
          approved_by?: string | null
          comment?: string | null
          created_at?: string | null
          id?: string
          transaction_id?: string | null
        }
        Update: {
          action?: string | null
          approved_by?: string | null
          comment?: string | null
          created_at?: string | null
          id?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_logs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_logs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_number: string | null
          agency: string | null
          balance: number | null
          bank_name: string | null
          color: string | null
          company_id: string
          created_at: string | null
          id: string
          initial_balance: number | null
          is_active: boolean | null
          minimum_balance: number | null
          name: string
          updated_at: string | null
        }
        Insert: {
          account_number?: string | null
          agency?: string | null
          balance?: number | null
          bank_name?: string | null
          color?: string | null
          company_id: string
          created_at?: string | null
          id?: string
          initial_balance?: number | null
          is_active?: boolean | null
          minimum_balance?: number | null
          name: string
          updated_at?: string | null
        }
        Update: {
          account_number?: string | null
          agency?: string | null
          balance?: number | null
          bank_name?: string | null
          color?: string | null
          company_id?: string
          created_at?: string | null
          id?: string
          initial_balance?: number | null
          is_active?: boolean | null
          minimum_balance?: number | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_balance_reconciliation: {
        Row: {
          bank_account_id: string
          bank_balance: number
          bank_statement_import_id: string | null
          company_id: string
          created_at: string
          date: string
          difference: number
          id: string
          source: string | null
          status: string
          system_balance: number
        }
        Insert: {
          bank_account_id: string
          bank_balance: number
          bank_statement_import_id?: string | null
          company_id: string
          created_at?: string
          date: string
          difference: number
          id?: string
          source?: string | null
          status?: string
          system_balance: number
        }
        Update: {
          bank_account_id?: string
          bank_balance?: number
          bank_statement_import_id?: string | null
          company_id?: string
          created_at?: string
          date?: string
          difference?: number
          id?: string
          source?: string | null
          status?: string
          system_balance?: number
        }
        Relationships: [
          {
            foreignKeyName: "bank_balance_reconciliation_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_balance_reconciliation_bank_statement_import_id_fkey"
            columns: ["bank_statement_import_id"]
            isOneToOne: false
            referencedRelation: "bank_statement_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_balance_reconciliation_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statement_imports: {
        Row: {
          bank_account_id: string | null
          company_id: string | null
          filename: string | null
          id: string
          import_type: string | null
          imported_at: string | null
          matched_transactions: number | null
          status: string | null
          total_transactions: number | null
        }
        Insert: {
          bank_account_id?: string | null
          company_id?: string | null
          filename?: string | null
          id?: string
          import_type?: string | null
          imported_at?: string | null
          matched_transactions?: number | null
          status?: string | null
          total_transactions?: number | null
        }
        Update: {
          bank_account_id?: string | null
          company_id?: string | null
          filename?: string | null
          id?: string
          import_type?: string | null
          imported_at?: string | null
          matched_transactions?: number | null
          status?: string | null
          total_transactions?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_imports_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_imports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statements: {
        Row: {
          amount: number
          bank_account_id: string
          company_id: string
          created_at: string | null
          date: string
          description: string | null
          fitid: string | null
          id: string
          is_reconciled: boolean | null
          transaction_id: string | null
          type: string | null
        }
        Insert: {
          amount: number
          bank_account_id: string
          company_id: string
          created_at?: string | null
          date: string
          description?: string | null
          fitid?: string | null
          id?: string
          is_reconciled?: boolean | null
          transaction_id?: string | null
          type?: string | null
        }
        Update: {
          amount?: number
          bank_account_id?: string
          company_id?: string
          created_at?: string | null
          date?: string
          description?: string | null
          fitid?: string | null
          id?: string
          is_reconciled?: boolean | null
          transaction_id?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_statements_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statements_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string | null
          company_id: string | null
          created_at: string | null
          dre_block: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          is_cmv: boolean
          monthly_budget: number | null
          name: string
          parent_id: string | null
          type: string | null
        }
        Insert: {
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          dre_block?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_cmv?: boolean
          monthly_budget?: number | null
          name: string
          parent_id?: string | null
          type?: string | null
        }
        Update: {
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          dre_block?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_cmv?: boolean
          monthly_budget?: number | null
          name?: string
          parent_id?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_rules: {
        Row: {
          category_id: string | null
          company_id: string | null
          created_at: string | null
          id: string
          last_applied: string | null
          pattern: string
          times_applied: number | null
        }
        Insert: {
          category_id?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          last_applied?: string | null
          pattern: string
          times_applied?: number | null
        }
        Update: {
          category_id?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          last_applied?: string | null
          pattern?: string
          times_applied?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "category_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      charging_logs: {
        Row: {
          channel: string
          company_id: string
          created_at: string | null
          id: string
          message: string
          sent_by: string | null
          transaction_id: string
        }
        Insert: {
          channel: string
          company_id: string
          created_at?: string | null
          id?: string
          message: string
          sent_by?: string | null
          transaction_id: string
        }
        Update: {
          channel?: string
          company_id?: string
          created_at?: string | null
          id?: string
          message?: string
          sent_by?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "charging_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charging_logs_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charging_logs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      charging_schedules: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          rules: Json
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          rules?: Json
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          rules?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "charging_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          company_id: string
          created_at: string | null
          dre_category: string | null
          dre_order: number | null
          id: string
          is_active: boolean | null
          name: string
          parent_id: string | null
          type: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          dre_category?: string | null
          dre_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          parent_id?: string | null
          type: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          dre_category?: string | null
          dre_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          parent_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_logs: {
        Row: {
          channel: string
          collection_rule_id: string | null
          company_id: string
          customer_id: string | null
          error_message: string | null
          id: string
          message_sent: string
          provider_message_id: string | null
          recipient: string
          sent_at: string | null
          status: string
          transaction_id: string | null
        }
        Insert: {
          channel: string
          collection_rule_id?: string | null
          company_id: string
          customer_id?: string | null
          error_message?: string | null
          id?: string
          message_sent: string
          provider_message_id?: string | null
          recipient: string
          sent_at?: string | null
          status?: string
          transaction_id?: string | null
        }
        Update: {
          channel?: string
          collection_rule_id?: string | null
          company_id?: string
          customer_id?: string | null
          error_message?: string | null
          id?: string
          message_sent?: string
          provider_message_id?: string | null
          recipient?: string
          sent_at?: string | null
          status?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collection_logs_collection_rule_id_fkey"
            columns: ["collection_rule_id"]
            isOneToOne: false
            referencedRelation: "collection_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_logs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_rules: {
        Row: {
          channel: string
          company_id: string
          created_at: string | null
          days_offset: number
          id: string
          is_active: boolean
          message_template: string
          name: string
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          channel: string
          company_id: string
          created_at?: string | null
          days_offset?: number
          id?: string
          is_active?: boolean
          message_template: string
          name: string
          trigger_type: string
          updated_at?: string | null
        }
        Update: {
          channel?: string
          company_id?: string
          created_at?: string | null
          days_offset?: number
          id?: string
          is_active?: boolean
          message_template?: string
          name?: string
          trigger_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collection_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      commitments: {
        Row: {
          alert_minutes_before: number | null
          alert_sent: boolean
          company_id: string
          created_at: string
          created_by: string | null
          description: string
          due_date: string
          due_time: string | null
          id: string
          notes: string | null
          recurrence: string | null
          recurrence_group_id: string | null
          updated_at: string
        }
        Insert: {
          alert_minutes_before?: number | null
          alert_sent?: boolean
          company_id: string
          created_at?: string
          created_by?: string | null
          description: string
          due_date: string
          due_time?: string | null
          id?: string
          notes?: string | null
          recurrence?: string | null
          recurrence_group_id?: string | null
          updated_at?: string
        }
        Update: {
          alert_minutes_before?: number | null
          alert_sent?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string
          due_time?: string | null
          id?: string
          notes?: string | null
          recurrence?: string | null
          recurrence_group_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commitments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          city: string | null
          cnpj: string | null
          created_at: string | null
          custom_app_name: string | null
          custom_favicon_url: string | null
          custom_logo_url: string | null
          custom_primary_color: string | null
          email: string | null
          id: string
          locked_until: string | null
          logo_url: string | null
          name: string
          phone: string | null
          plan: string | null
          plan_id: string | null
          resultados_show_ticket_medio: boolean
          segment: string | null
          state: string | null
          status: string | null
          trial_ends_at: string | null
          updated_at: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          cnpj?: string | null
          created_at?: string | null
          custom_app_name?: string | null
          custom_favicon_url?: string | null
          custom_logo_url?: string | null
          custom_primary_color?: string | null
          email?: string | null
          id?: string
          locked_until?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          plan?: string | null
          plan_id?: string | null
          resultados_show_ticket_medio?: boolean
          segment?: string | null
          state?: string | null
          status?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          cnpj?: string | null
          created_at?: string | null
          custom_app_name?: string | null
          custom_favicon_url?: string | null
          custom_logo_url?: string | null
          custom_primary_color?: string | null
          email?: string | null
          id?: string
          locked_until?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          plan?: string | null
          plan_id?: string | null
          resultados_show_ticket_medio?: boolean
          segment?: string | null
          state?: string | null
          status?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_centers: {
        Row: {
          code: string | null
          company_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          monthly_budget: number | null
          name: string
        }
        Insert: {
          code?: string | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          monthly_budget?: number | null
          name: string
        }
        Update: {
          code?: string | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          monthly_budget?: number | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_card_items: {
        Row: {
          amount: number
          category_id: string | null
          company_id: string
          created_at: string
          credit_card_id: string
          description: string
          id: string
          installment_number: number | null
          invoice_month: string
          original_description: string | null
          purchase_date: string
          supplier_id: string | null
          total_installments: number | null
        }
        Insert: {
          amount: number
          category_id?: string | null
          company_id: string
          created_at?: string
          credit_card_id: string
          description: string
          id?: string
          installment_number?: number | null
          invoice_month: string
          original_description?: string | null
          purchase_date: string
          supplier_id?: string | null
          total_installments?: number | null
        }
        Update: {
          amount?: number
          category_id?: string | null
          company_id?: string
          created_at?: string
          credit_card_id?: string
          description?: string
          id?: string
          installment_number?: number | null
          invoice_month?: string
          original_description?: string | null
          purchase_date?: string
          supplier_id?: string | null
          total_installments?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_card_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_card_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_card_items_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_card_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_cards: {
        Row: {
          brand: string | null
          closing_day: number | null
          color: string | null
          company_id: string | null
          created_at: string | null
          credit_limit: number | null
          due_day: number | null
          id: string
          is_active: boolean | null
          last_four_digits: string | null
          name: string
          statement_match_pattern: string | null
        }
        Insert: {
          brand?: string | null
          closing_day?: number | null
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          credit_limit?: number | null
          due_day?: number | null
          id?: string
          is_active?: boolean | null
          last_four_digits?: string | null
          name: string
          statement_match_pattern?: string | null
        }
        Update: {
          brand?: string | null
          closing_day?: number | null
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          credit_limit?: number | null
          due_day?: number | null
          id?: string
          is_active?: boolean | null
          last_four_digits?: string | null
          name?: string
          statement_match_pattern?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_cards_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_dashboard_cards: {
        Row: {
          chart_type: string
          company_id: string
          created_at: string | null
          display_order: number
          id: string
          metric_config: Json
          metric_type: string
          name: string
          page_key: string
          period_type: string
          updated_at: string | null
        }
        Insert: {
          chart_type: string
          company_id: string
          created_at?: string | null
          display_order?: number
          id?: string
          metric_config?: Json
          metric_type: string
          name: string
          page_key?: string
          period_type?: string
          updated_at?: string | null
        }
        Update: {
          chart_type?: string
          company_id?: string
          created_at?: string | null
          display_order?: number
          id?: string
          metric_config?: Json
          metric_type?: string
          name?: string
          page_key?: string
          period_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_dashboard_cards_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_recurrences: {
        Row: {
          category_id: string | null
          company_id: string
          created_at: string | null
          customer_id: string
          due_day: number
          frequency: string
          id: string
          is_active: boolean
          total_installments: number | null
        }
        Insert: {
          category_id?: string | null
          company_id: string
          created_at?: string | null
          customer_id: string
          due_day: number
          frequency: string
          id?: string
          is_active?: boolean
          total_installments?: number | null
        }
        Update: {
          category_id?: string | null
          company_id?: string
          created_at?: string | null
          customer_id?: string
          due_day?: number
          frequency?: string
          id?: string
          is_active?: boolean
          total_installments?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_recurrences_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_recurrences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_recurrences_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          company_id: string
          cpf_cnpj: string | null
          created_at: string | null
          default_category_id: string | null
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          phone: string | null
          state: string | null
          type: string | null
          updated_at: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          company_id: string
          cpf_cnpj?: string | null
          created_at?: string | null
          default_category_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          phone?: string | null
          state?: string | null
          type?: string | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          company_id?: string
          cpf_cnpj?: string | null
          created_at?: string | null
          default_category_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          phone?: string | null
          state?: string | null
          type?: string | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_default_category_id_fkey"
            columns: ["default_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      favorite_notifications: {
        Row: {
          body: string
          company_id: string
          created_at: string
          id: string
          title: string
        }
        Insert: {
          body: string
          company_id: string
          created_at?: string
          id?: string
          title: string
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorite_notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      name_rules: {
        Row: {
          company_id: string | null
          created_at: string | null
          customer_id: string | null
          id: string
          original_pattern: string
          suggested_name: string
          supplier_id: string | null
          times_applied: number | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          original_pattern: string
          suggested_name: string
          supplier_id?: string | null
          times_applied?: number | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          original_pattern?: string
          suggested_name?: string
          supplier_id?: string | null
          times_applied?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "name_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "name_rules_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "name_rules_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          body: string
          company_id: string
          error_message: string | null
          id: string
          sent_at: string | null
          status: string
          title: string
          triggered_by: string
          type: string
          user_id: string | null
        }
        Insert: {
          body: string
          company_id: string
          error_message?: string | null
          id?: string
          sent_at?: string | null
          status?: string
          title: string
          triggered_by?: string
          type?: string
          user_id?: string | null
        }
        Update: {
          body?: string
          company_id?: string
          error_message?: string | null
          id?: string
          sent_at?: string | null
          status?: string
          title?: string
          triggered_by?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_recipients: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          is_active: boolean
          preferred_days: number[] | null
          preferred_time: string | null
          push_subscription: Json | null
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          preferred_days?: number[] | null
          preferred_time?: string | null
          push_subscription?: Json | null
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          preferred_days?: number[] | null
          preferred_time?: string | null
          push_subscription?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_recipients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          company_id: string
          created_at: string | null
          custom_body: string | null
          custom_title: string | null
          id: string
          is_active: boolean
          notify_days: number[]
          notify_time: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          custom_body?: string | null
          custom_title?: string | null
          id?: string
          is_active?: boolean
          notify_days?: number[]
          notify_time?: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          custom_body?: string | null
          custom_title?: string | null
          id?: string
          is_active?: boolean
          notify_days?: number[]
          notify_time?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          link_url: string | null
          message: string | null
          read_at: string | null
          title: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link_url?: string | null
          message?: string | null
          read_at?: string | null
          title?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link_url?: string | null
          message?: string | null
          read_at?: string | null
          title?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string | null
          features: Json | null
          id: string
          is_active: boolean | null
          max_transactions: number | null
          max_users: number | null
          name: string
          price: number | null
        }
        Insert: {
          created_at?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_transactions?: number | null
          max_users?: number | null
          name: string
          price?: number | null
        }
        Update: {
          created_at?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_transactions?: number | null
          max_users?: number | null
          name?: string
          price?: number | null
        }
        Relationships: []
      }
      products: {
        Row: {
          category: string | null
          code: string | null
          company_id: string
          cost_price: number | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          min_stock: number | null
          name: string
          sale_price: number | null
          stock_quantity: number | null
          type: string | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          code?: string | null
          company_id: string
          cost_price?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          min_stock?: number | null
          name: string
          sale_price?: number | null
          stock_quantity?: number | null
          type?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          code?: string | null
          company_id?: string
          cost_price?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          min_stock?: number | null
          name?: string
          sale_price?: number | null
          stock_quantity?: number | null
          type?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          last_seen_at: string | null
          notification_preferences: Json | null
          role: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          last_seen_at?: string | null
          notification_preferences?: Json | null
          role?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          last_seen_at?: string | null
          notification_preferences?: Json | null
          role?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_forecast_overrides: {
        Row: {
          company_id: string
          created_at: string
          date: string
          expected_amount: number
          id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          date: string
          expected_amount: number
          id?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          date?: string
          expected_amount?: number
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_forecast_overrides_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_forecasts: {
        Row: {
          company_id: string
          created_at: string | null
          day_of_week: number
          expected_amount: number
          id: string
          month: number
          year: number
        }
        Insert: {
          company_id: string
          created_at?: string | null
          day_of_week: number
          expected_amount?: number
          id?: string
          month: number
          year: number
        }
        Update: {
          company_id?: string
          created_at?: string | null
          day_of_week?: number
          expected_amount?: number
          id?: string
          month?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "revenue_forecasts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      role_page_permissions: {
        Row: {
          can_edit: boolean
          can_view: boolean
          created_at: string | null
          id: string
          page_key: string
          role: string
          updated_at: string | null
        }
        Insert: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string | null
          id?: string
          page_key: string
          role: string
          updated_at?: string | null
        }
        Update: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string | null
          id?: string
          page_key?: string
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      sales_order_items: {
        Row: {
          created_at: string | null
          description: string | null
          discount: number | null
          id: string
          product_id: string | null
          quantity: number
          sales_order_id: string
          total: number
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          discount?: number | null
          id?: string
          product_id?: string | null
          quantity?: number
          sales_order_id: string
          total: number
          unit_price: number
        }
        Update: {
          created_at?: string | null
          description?: string | null
          discount?: number | null
          id?: string
          product_id?: string | null
          quantity?: number
          sales_order_id?: string
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          company_id: string
          created_at: string | null
          customer_id: string | null
          delivery_date: string | null
          discount: number | null
          id: string
          issue_date: string | null
          notes: string | null
          order_number: number
          payment_method: string | null
          status: string | null
          subtotal: number | null
          total: number | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          customer_id?: string | null
          delivery_date?: string | null
          discount?: number | null
          id?: string
          issue_date?: string | null
          notes?: string | null
          order_number?: number
          payment_method?: string | null
          status?: string | null
          subtotal?: number | null
          total?: number | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          customer_id?: string | null
          delivery_date?: string | null
          discount?: number | null
          id?: string
          issue_date?: string | null
          notes?: string | null
          order_number?: number
          payment_method?: string | null
          status?: string | null
          subtotal?: number | null
          total?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          product_id: string
          quantity: number
          reason: string | null
          sales_order_id: string | null
          type: string
          unit_cost: number | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          product_id: string
          quantity: number
          reason?: string | null
          sales_order_id?: string | null
          type: string
          unit_cost?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          product_id?: string
          quantity?: number
          reason?: string | null
          sales_order_id?: string | null
          type?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admin_logs: {
        Row: {
          action: string | null
          admin_id: string | null
          created_at: string | null
          details: Json | null
          id: string
          target_company_id: string | null
        }
        Insert: {
          action?: string | null
          admin_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          target_company_id?: string | null
        }
        Update: {
          action?: string | null
          admin_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          target_company_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "super_admin_logs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "super_admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "super_admin_logs_target_company_id_fkey"
            columns: ["target_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admins: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      supplier_aliases: {
        Row: {
          canonical_name: string
          category_id: string | null
          cnpj_cpf: string | null
          company_id: string | null
          created_at: string | null
          id: string
          last_applied: string | null
          raw_name: string | null
          subcategory_id: string | null
          supplier_id: string | null
          times_applied: number | null
        }
        Insert: {
          canonical_name: string
          category_id?: string | null
          cnpj_cpf?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          last_applied?: string | null
          raw_name?: string | null
          subcategory_id?: string | null
          supplier_id?: string | null
          times_applied?: number | null
        }
        Update: {
          canonical_name?: string
          category_id?: string | null
          cnpj_cpf?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          last_applied?: string | null
          raw_name?: string | null
          subcategory_id?: string | null
          supplier_id?: string | null
          times_applied?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_aliases_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_aliases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_aliases_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_aliases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          base_salary: number | null
          biweekly_payment_day: number | null
          city: string | null
          company_id: string
          cpf_cnpj: string | null
          created_at: string | null
          default_category_id: string | null
          default_payment_method: string | null
          email: string | null
          id: string
          is_active: boolean | null
          is_employee: boolean | null
          name: string
          notes: string | null
          phone: string | null
          pix_key: string | null
          pix_key_type: string | null
          role: string | null
          salary_payment_day: number | null
          state: string | null
          type: string | null
          updated_at: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          base_salary?: number | null
          biweekly_payment_day?: number | null
          city?: string | null
          company_id: string
          cpf_cnpj?: string | null
          created_at?: string | null
          default_category_id?: string | null
          default_payment_method?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_employee?: boolean | null
          name: string
          notes?: string | null
          phone?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          role?: string | null
          salary_payment_day?: number | null
          state?: string | null
          type?: string | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          base_salary?: number | null
          biweekly_payment_day?: number | null
          city?: string | null
          company_id?: string
          cpf_cnpj?: string | null
          created_at?: string | null
          default_category_id?: string | null
          default_payment_method?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_employee?: boolean | null
          name?: string
          notes?: string | null
          phone?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          role?: string | null
          salary_payment_day?: number | null
          state?: string | null
          type?: string | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_default_category_id_fkey"
            columns: ["default_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string | null
          amount: number
          approval_status: string | null
          attachment_url: string | null
          bank_account_id: string | null
          bank_statement_import_id: string | null
          boleto_barcode: string | null
          boleto_due_date: string | null
          card_brand: string | null
          card_installments: number | null
          card_invoice_date: string | null
          category_auto_applied: boolean | null
          category_id: string | null
          cnpj_cpf: string | null
          company_id: string
          cost_center_id: string | null
          created_at: string | null
          created_by: string | null
          credit_card_id: string | null
          customer_id: string | null
          customer_recurrence_id: string | null
          dda_fingerprint: string | null
          description: string
          document_number: string | null
          due_date: string | null
          edited_description: string | null
          id: string
          installment_number: number | null
          is_reconciled: boolean | null
          is_undated: boolean | null
          linha_digitavel: string | null
          notes: string | null
          original_description: string | null
          payment_date: string | null
          payment_method: string | null
          pix_key: string | null
          pix_key_type: string | null
          pix_qr_code: string | null
          recurrence: string | null
          recurrence_group_id: string | null
          recurrence_interval_months: number | null
          status: string | null
          supplier_id: string | null
          total_installments: number | null
          type: string
          updated_at: string | null
          vencimento_original: string | null
        }
        Insert: {
          account_id?: string | null
          amount: number
          approval_status?: string | null
          attachment_url?: string | null
          bank_account_id?: string | null
          bank_statement_import_id?: string | null
          boleto_barcode?: string | null
          boleto_due_date?: string | null
          card_brand?: string | null
          card_installments?: number | null
          card_invoice_date?: string | null
          category_auto_applied?: boolean | null
          category_id?: string | null
          cnpj_cpf?: string | null
          company_id: string
          cost_center_id?: string | null
          created_at?: string | null
          created_by?: string | null
          credit_card_id?: string | null
          customer_id?: string | null
          customer_recurrence_id?: string | null
          dda_fingerprint?: string | null
          description: string
          document_number?: string | null
          due_date?: string | null
          edited_description?: string | null
          id?: string
          installment_number?: number | null
          is_reconciled?: boolean | null
          is_undated?: boolean | null
          linha_digitavel?: string | null
          notes?: string | null
          original_description?: string | null
          payment_date?: string | null
          payment_method?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          pix_qr_code?: string | null
          recurrence?: string | null
          recurrence_group_id?: string | null
          recurrence_interval_months?: number | null
          status?: string | null
          supplier_id?: string | null
          total_installments?: number | null
          type: string
          updated_at?: string | null
          vencimento_original?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          approval_status?: string | null
          attachment_url?: string | null
          bank_account_id?: string | null
          bank_statement_import_id?: string | null
          boleto_barcode?: string | null
          boleto_due_date?: string | null
          card_brand?: string | null
          card_installments?: number | null
          card_invoice_date?: string | null
          category_auto_applied?: boolean | null
          category_id?: string | null
          cnpj_cpf?: string | null
          company_id?: string
          cost_center_id?: string | null
          created_at?: string | null
          created_by?: string | null
          credit_card_id?: string | null
          customer_id?: string | null
          customer_recurrence_id?: string | null
          dda_fingerprint?: string | null
          description?: string
          document_number?: string | null
          due_date?: string | null
          edited_description?: string | null
          id?: string
          installment_number?: number | null
          is_reconciled?: boolean | null
          is_undated?: boolean | null
          linha_digitavel?: string | null
          notes?: string | null
          original_description?: string | null
          payment_date?: string | null
          payment_method?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          pix_qr_code?: string | null
          recurrence?: string | null
          recurrence_group_id?: string | null
          recurrence_interval_months?: number | null
          status?: string | null
          supplier_id?: string | null
          total_installments?: number | null
          type?: string
          updated_at?: string | null
          vencimento_original?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_bank_statement_import_id_fkey"
            columns: ["bank_statement_import_id"]
            isOneToOne: false
            referencedRelation: "bank_statement_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_customer_recurrence_id_fkey"
            columns: ["customer_recurrence_id"]
            isOneToOne: false
            referencedRelation: "customer_recurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_pages_read: {
        Args: { p_page_keys: string[] }
        Returns: boolean
      }
      can_access_pages_write: {
        Args: { p_page_keys: string[] }
        Returns: boolean
      }
      has_page_permission: {
        Args: { p_need_edit?: boolean; p_page_key: string }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
