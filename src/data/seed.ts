// P08 ToDo-Ticket - Startbestand: Wertelisten und Regeln.
//
// Erzeugt aus dem Datenskelett des Konzepts V01-04 (20260917-0523),
// Regelwerte gemaess der Entscheidungsdatei V01-01 (20260917-1407):
// D02, E01 und E03 sind aktiv und rechnen in ARBEITSTAGEN.
//
// Die Parameter stehen bewusst hier und in der Sammlung "rules" des
// Datenbestands, nicht fest im Code - sie sind in den Einstellungen
// aenderbar (Kapitel 17: nachvollziehbare Automatik).

import type { Rule, ValueItem } from "./types";

export const SEED_VALUES: ValueItem[] = [
  {
    "id": "PERSON_CLS",
    "group": "Person",
    "label": "CLS",
    "aliases": [
      "Clemens"
    ],
    "active": true,
    "sortOrder": 0
  },
  {
    "id": "STATUS_1",
    "group": "Status",
    "label": "Offen",
    "aliases": [],
    "active": true,
    "sortOrder": 0
  },
  {
    "id": "STATUS_2",
    "group": "Status",
    "label": "In Bearbeitung",
    "aliases": [],
    "active": true,
    "sortOrder": 1
  },
  {
    "id": "STATUS_3",
    "group": "Status",
    "label": "Erledigt",
    "aliases": [],
    "active": true,
    "sortOrder": 2
  },
  {
    "id": "PRIORITÄT_1",
    "group": "Priorität",
    "label": "Hoch",
    "aliases": [],
    "active": true,
    "sortOrder": 0
  },
  {
    "id": "PRIORITÄT_2",
    "group": "Priorität",
    "label": "Mittel",
    "aliases": [],
    "active": true,
    "sortOrder": 1
  },
  {
    "id": "PRIORITÄT_3",
    "group": "Priorität",
    "label": "Niedrig",
    "aliases": [],
    "active": true,
    "sortOrder": 2
  },
  {
    "id": "ARBEITSART_1",
    "group": "Arbeitsart",
    "label": "Telefon",
    "aliases": [],
    "active": true,
    "sortOrder": 0
  },
  {
    "id": "ARBEITSART_2",
    "group": "Arbeitsart",
    "label": "E-Mail",
    "aliases": [],
    "active": true,
    "sortOrder": 1
  },
  {
    "id": "ARBEITSART_3",
    "group": "Arbeitsart",
    "label": "Besprechung",
    "aliases": [],
    "active": true,
    "sortOrder": 2
  },
  {
    "id": "ARBEITSART_4",
    "group": "Arbeitsart",
    "label": "Schreibtischarbeit",
    "aliases": [],
    "active": true,
    "sortOrder": 3
  },
  {
    "id": "QUELLENTYP_1",
    "group": "Quellentyp",
    "label": "Mail",
    "aliases": [],
    "active": true,
    "sortOrder": 0
  },
  {
    "id": "QUELLENTYP_2",
    "group": "Quellentyp",
    "label": "Protokoll",
    "aliases": [],
    "active": true,
    "sortOrder": 1
  },
  {
    "id": "QUELLENTYP_3",
    "group": "Quellentyp",
    "label": "Gespräch",
    "aliases": [],
    "active": true,
    "sortOrder": 2
  },
  {
    "id": "QUELLENTYP_4",
    "group": "Quellentyp",
    "label": "Besprechung",
    "aliases": [],
    "active": true,
    "sortOrder": 3
  },
  {
    "id": "QUELLENTYP_5",
    "group": "Quellentyp",
    "label": "Dokument",
    "aliases": [],
    "active": true,
    "sortOrder": 4
  },
  {
    "id": "QUELLENTYP_6",
    "group": "Quellentyp",
    "label": "Bescheid",
    "aliases": [],
    "active": true,
    "sortOrder": 5
  },
  {
    "id": "QUELLENTYP_7",
    "group": "Quellentyp",
    "label": "Sonstige",
    "aliases": [],
    "active": true,
    "sortOrder": 6
  },
  {
    "id": "PROJECT_ZNA",
    "group": "Projekt",
    "label": "ZNA",
    "aliases": [],
    "active": true,
    "sortOrder": 0
  },
  {
    "id": "PROJECT_LAB",
    "group": "Projekt",
    "label": "LAB",
    "aliases": [],
    "active": true,
    "sortOrder": 1
  },
  {
    "id": "PROJECT_KFN",
    "group": "Projekt",
    "label": "KFN",
    "aliases": [],
    "active": true,
    "sortOrder": 2
  },
  {
    "id": "PROJECT_WHF",
    "group": "Projekt",
    "label": "WHF",
    "aliases": [],
    "active": true,
    "sortOrder": 3
  },
  {
    "id": "PROJECT_AWB",
    "group": "Projekt",
    "label": "AWB",
    "aliases": [],
    "active": true,
    "sortOrder": 4
  },
  {
    "id": "PROJECT_ILE",
    "group": "Projekt",
    "label": "ILE",
    "aliases": [],
    "active": true,
    "sortOrder": 5
  },
  {
    "id": "PROJECT_MGZ",
    "group": "Projekt",
    "label": "MGZ",
    "aliases": [],
    "active": true,
    "sortOrder": 6
  },
  {
    "id": "PROJECT_PSY",
    "group": "Projekt",
    "label": "PSY",
    "aliases": [],
    "active": true,
    "sortOrder": 7
  },
  {
    "id": "PROJECT_PI1",
    "group": "Projekt",
    "label": "PI1",
    "aliases": [],
    "active": true,
    "sortOrder": 8
  },
  {
    "id": "PROJECT_FOR",
    "group": "Projekt",
    "label": "FOR",
    "aliases": [],
    "active": true,
    "sortOrder": 9
  },
  {
    "id": "TOPIC_1",
    "group": "Thema",
    "label": "Behörden",
    "aliases": [],
    "active": true,
    "sortOrder": 0
  },
  {
    "id": "TOPIC_2",
    "group": "Thema",
    "label": "AEV",
    "aliases": [],
    "active": true,
    "sortOrder": 1
  },
  {
    "id": "TOPIC_3",
    "group": "Thema",
    "label": "IBN",
    "aliases": [],
    "active": true,
    "sortOrder": 2
  },
  {
    "id": "TOPIC_4",
    "group": "Thema",
    "label": "LV",
    "aliases": [],
    "active": true,
    "sortOrder": 3
  },
  {
    "id": "TOPIC_5",
    "group": "Thema",
    "label": "PV",
    "aliases": [],
    "active": true,
    "sortOrder": 4
  },
  {
    "id": "TOPIC_6",
    "group": "Thema",
    "label": "Kosten",
    "aliases": [],
    "active": true,
    "sortOrder": 5
  },
  {
    "id": "MEETING_1",
    "group": "Besprechungskreis",
    "label": "PL-JF",
    "aliases": [],
    "active": true,
    "sortOrder": 0
  },
  {
    "id": "MEETING_2",
    "group": "Besprechungskreis",
    "label": "AEV-JF",
    "aliases": [],
    "active": true,
    "sortOrder": 1
  },
  {
    "id": "MEETING_3",
    "group": "Besprechungskreis",
    "label": "IBN-JF",
    "aliases": [],
    "active": true,
    "sortOrder": 2
  },
  {
    "id": "MEETING_4",
    "group": "Besprechungskreis",
    "label": "Intern",
    "aliases": [],
    "active": true,
    "sortOrder": 3
  }
];

export const SEED_RULES: Rule[] = [
  {
    "id": "D01",
    "name": "Lead löst Delegation aus",
    "state": "Festgelegt",
    "enabled": true,
    "trigger": "Anlegen oder Lead-Wechsel",
    "parameters": {
      "selfId": "PERSON_CLS"
    },
    "action": "Bei fremdem Lead dringenden Delegationshinweis anzeigen; keinen zusätzlichen Verantwortlichen erfragen.",
    "reason": "Lead ist das einzige Feld für die ausführende Person."
  },
  {
    "id": "D02",
    "name": "Interne Delegationsfrist",
    "state": "Festgelegt",
    "enabled": true,
    "trigger": "Delegation wird erforderlich",
    "parameters": {
      "offsetDays": 1,
      "dayBasis": "Arbeitstag",
      "allowedDayBasis": [
        "Kalendertag",
        "Arbeitstag"
      ],
      "scope": "global",
      "capAtDueDate": true
    },
    "action": "Sofort dringlich; spätestens nächster Tag. Vorschlag Kalendertag; alternativ Arbeitstag global einstellbar. Vor Aktivierung bestätigen. Früherer Solltermin hat Vorrang.",
    "reason": "Benutzer nannte nächsten Tag; nächster Arbeitstag war eine spätere Assistenteninterpretation."
  },
  {
    "id": "D03",
    "name": "Delegation bestätigen",
    "state": "Festgelegt",
    "enabled": true,
    "trigger": "Klick auf Delegation bestätigen",
    "parameters": {},
    "action": "Empfänger und Zeitpunkt sichern, Status In Bearbeitung; Solltermin unverändert.",
    "reason": "Kopieren oder Erstellen eines Mailtexts bestätigt keine erfolgte Übergabe."
  },
  {
    "id": "D04",
    "name": "Lead nach Delegation wechseln",
    "state": "Vorschlag",
    "enabled": true,
    "trigger": "Lead wurde geändert",
    "parameters": {},
    "action": "Vorherige Delegation im Verlauf erhalten; aktuelle Bestätigung leeren, neuen Bedarf setzen. Bei CLS entfällt neuer Bedarf.",
    "reason": "Keine alte Bestätigung auf neue Person übertragen."
  },
  {
    "id": "D05",
    "name": "Wiederöffnung und erneute Delegation",
    "state": "Vorschlag",
    "enabled": true,
    "trigger": "Wiederöffnung oder Erneut delegieren",
    "parameters": {
      "sameOriginalAssignment": "retainConfirmedDelegation",
      "newAssignment": "explicitRedelegationOrNewTask",
      "preserveHistory": true
    },
    "action": "Unveränderter Originalauftrag behält Delegation; erneuter Auftrag benötigt neue Bestätigung.",
    "reason": "Gleicher Lead bedeutet nicht automatisch Kenntnis einer neuen Arbeit."
  },
  {
    "id": "E01",
    "name": "Hinweis vor Solltermin",
    "state": "Festgelegt",
    "enabled": true,
    "trigger": "Tägliche Prüfung / Öffnen",
    "parameters": {
      "businessDaysBefore": [
        3,
        2,
        1,
        0
      ],
      "calendar": null,
      "channel": "inApp"
    },
    "action": "Nachfragen vorschlagen; genaue Anzahl und Kanal noch abstimmen. Keine Nachricht an Dritte automatisch versenden.",
    "reason": "1, 2 oder 3 Arbeitstage wurden als Möglichkeit genannt, nicht als drei verpflichtende Meldungen beschlossen."
  },
  {
    "id": "E02",
    "name": "Heute fällig / überfällig",
    "state": "Festgelegt",
    "enabled": true,
    "trigger": "Tageswechsel / Öffnen",
    "parameters": {},
    "action": "Offene Tickets und Aufgaben anhand des Solltermins markieren und filtern.",
    "reason": "Keine neue Deadline automatisch erzeugen."
  },
  {
    "id": "E03",
    "name": "Alterung ohne Solltermin",
    "state": "Festgelegt",
    "enabled": true,
    "trigger": "Tägliche Prüfung",
    "parameters": {
      "businessDaysWithoutDueDate": 20
    },
    "action": "Nicht terminierte Punkte im Blick halten; Schwellenwerte noch festlegen.",
    "reason": "Auch niedrig priorisierte Aufgaben dürfen nicht dauerhaft verschwinden."
  },
  {
    "id": "E04",
    "name": "Hinweise bündeln",
    "state": "Vorschlag",
    "enabled": true,
    "trigger": "Erinnerung fällig",
    "parameters": {
      "perObjectPerDay": 1
    },
    "action": "Gleichartige Hinweise zusammenfassen und erfolgreiche Ausgabe im Verlauf vermerken.",
    "reason": "Zeit sparen und Erinnerungsflut vermeiden."
  },
  {
    "id": "A01",
    "name": "Erledigt und Folgeaufgabe",
    "state": "Festgelegt",
    "enabled": true,
    "trigger": "Benutzeraktion",
    "parameters": {},
    "action": "Vorgänger abschließen; Folgeaufgabe mit neuer ID, gleicher Ticket-ID und Vorgänger-ID anlegen.",
    "reason": "Historie bleibt erhalten; kein zweites Hauptticket."
  },
  {
    "id": "A02",
    "name": "Ticket manuell abschließen",
    "state": "Festgelegt",
    "enabled": true,
    "trigger": "Alle Aufgaben erledigt",
    "parameters": {},
    "action": "Abschluss oder weitere Aufgabe anbieten; Ticket nicht automatisch schließen.",
    "reason": "Alle Schritte erledigt bedeutet nicht automatisch Ziel erreicht."
  },
  {
    "id": "A03",
    "name": "Offene Aufgaben beim Abschluss",
    "state": "Vorschlag",
    "enabled": false,
    "trigger": "Ticketabschluss mit offenen Aufgaben",
    "parameters": {},
    "action": "Abschluss stoppen und offene Aufgaben anzeigen; keine stillen Massenerledigungen.",
    "reason": "Vermeidet widersprüchliche Zustände."
  },
  {
    "id": "K01",
    "name": "Vorschläge bestätigen",
    "state": "Festgelegt",
    "enabled": true,
    "trigger": "KI erkennt mögliche Zuordnung",
    "parameters": {},
    "action": "Vorschlag markiert und getrennt speichern; bestätigen, ändern, verwerfen oder ignorieren.",
    "reason": "Benutzerangaben nicht durch unsichere Vermutungen ersetzen."
  },
  {
    "id": "K02",
    "name": "Kontextreihung",
    "state": "Vorschlag",
    "enabled": true,
    "trigger": "Filter oder Kontext gewählt",
    "parameters": {
      "order": [
        "overdue",
        "delegation",
        "dueSoon",
        "age",
        "priority"
      ]
    },
    "action": "Passende Punkte nach nachvollziehbaren Gründen ordnen; globale Warnungen separat erhalten.",
    "reason": "Die konkrete Rangfolge ist Review-Vorschlag, kein bestätigtes Punktesystem."
  },
  {
    "id": "I01",
    "name": "Dokumentimport",
    "state": "Später",
    "enabled": false,
    "trigger": "Mail / Protokoll importiert",
    "parameters": {},
    "action": "Quellenbezogene Kandidaten und mögliche Dubletten zur Prüfung anbieten.",
    "reason": "Vorlage V01-02 enthält wertvolle Extraktionsregeln, jedoch keinen fertigen Importprozess."
  }
];
