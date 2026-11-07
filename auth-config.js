/* ============================================================
   BYTEWERK STUDIO — AUTH CONFIGURATION
   ------------------------------------------------------------
   mode: 'local'    Konten werden im Browser gespeichert.
                    Funktioniert sofort, ohne Server. Geeignet fuer
                    Vorschau und Ein-Geraet-Nutzung. Kein Ersatz fuer
                    ein echtes Backend (Geraetewechsel, Passwort-Mail,
                    serverseitige Sperren sind nicht moeglich).

   mode: 'supabase' Echte Konten mit E-Mail-Bestaetigung, Passwort-
                    Reset und Synchronisierung ueber Geraete hinweg.
                    Dafuer ein Supabase-Projekt anlegen, das Schema
                    aus supabase/schema.sql ausfuehren und URL sowie
                    anon key hier eintragen. Siehe docs/KONTO.md.

                    Wichtig: Die CSP jeder Seite erlaubt nur 'self'.
                    Fuer den Supabase-Modus muss dort der genaue Host
                    ergaenzt werden, z. B.
                    connect-src 'self' https://<projekt>.supabase.co;
                    Kein Platzhalter (https://*.supabase.co): der
                    erlaubt jedes fremde Supabase-Projekt als Ziel.

   Der anon key ist ein oeffentlicher Client-Key. Niemals den
   service_role key hier eintragen.
   ============================================================ */

window.BW_AUTH_CONFIG = {
  mode: 'local',

  supabaseUrl: '',
  supabaseAnonKey: '',

  siteUrl: 'https://bytewerkstudio.com',
  supportEmail: 'Haqmalh@icloud.com',
  sessionDays: 30
};
