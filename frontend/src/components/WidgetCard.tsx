import { useEffect, useState, useRef, Component } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  LineChart, Line,
  ResponsiveContainer,
} from "recharts";
import { getWidgetData } from "../api";
import type { Widget, WidgetData, Credentials, Dashboard } from "../api";

const COLORS = ["#4a9fd4", "#f0a030", "#2db87a", "#e05c5c", "#7ab8e8", "#a78bfa", "#34d399", "#fb923c"];

// Fields whose values are file paths — strip to basename for display
const PATH_FIELDS = new Set([
  "process_name", "parent_name", "childproc_name",
  "blocked_name", "process_sha256",
]);

function maybeBasename(field: string, value: string): string {
  if (!PATH_FIELDS.has(field)) return value;
  return value.replace(/.*[/\\]/, "") || value;
}

const MITRE_TECHNIQUES: Record<string, string> = {
  // Base techniques
  "T1001": "Data Obfuscation", "T1003": "OS Credential Dumping", "T1005": "Data from Local System",
  "T1007": "System Service Discovery", "T1008": "Fallback Channels", "T1010": "Application Window Discovery",
  "T1012": "Query Registry", "T1014": "Rootkit", "T1016": "System Network Configuration Discovery",
  "T1018": "Remote System Discovery", "T1021": "Remote Services", "T1025": "Data from Removable Media",
  "T1027": "Obfuscated Files or Information", "T1029": "Scheduled Transfer", "T1030": "Data Transfer Size Limits",
  "T1033": "System Owner/User Discovery", "T1036": "Masquerading", "T1037": "Boot or Logon Initialization Scripts",
  "T1039": "Data from Network Shared Drive", "T1040": "Network Sniffing", "T1041": "Exfiltration Over C2 Channel",
  "T1046": "Network Service Discovery", "T1047": "Windows Management Instrumentation",
  "T1048": "Exfiltration Over Alternative Protocol", "T1049": "System Network Connections Discovery",
  "T1052": "Exfiltration Over Physical Medium", "T1053": "Scheduled Task/Job", "T1055": "Process Injection",
  "T1056": "Input Capture", "T1057": "Process Discovery", "T1059": "Command and Scripting Interpreter",
  "T1068": "Exploitation for Privilege Escalation", "T1069": "Permission Groups Discovery",
  "T1070": "Indicator Removal", "T1071": "Application Layer Protocol", "T1072": "Software Deployment Tools",
  "T1074": "Data Staged", "T1078": "Valid Accounts", "T1080": "Taint Shared Content",
  "T1082": "System Information Discovery", "T1083": "File and Directory Discovery",
  "T1087": "Account Discovery", "T1090": "Proxy", "T1091": "Replication Through Removable Media",
  "T1095": "Non-Application Layer Protocol", "T1098": "Account Manipulation", "T1102": "Web Service",
  "T1104": "Multi-Stage Channels", "T1105": "Ingress Tool Transfer", "T1106": "Native API",
  "T1110": "Brute Force", "T1111": "MFA Interception", "T1112": "Modify Registry",
  "T1113": "Screen Capture", "T1114": "Email Collection", "T1115": "Clipboard Data",
  "T1119": "Automated Collection", "T1120": "Peripheral Device Discovery", "T1123": "Audio Capture",
  "T1124": "System Time Discovery", "T1125": "Video Capture",
  "T1127": "Trusted Developer Utilities Proxy Execution", "T1129": "Shared Modules",
  "T1132": "Data Encoding", "T1133": "External Remote Services", "T1134": "Access Token Manipulation",
  "T1135": "Network Share Discovery", "T1136": "Create Account", "T1137": "Office Application Startup",
  "T1140": "Deobfuscate/Decode Files or Information", "T1176": "Browser Extensions",
  "T1185": "Browser Session Hijacking", "T1187": "Forced Authentication",
  "T1189": "Drive-by Compromise", "T1190": "Exploit Public-Facing Application",
  "T1195": "Supply Chain Compromise", "T1197": "BITS Jobs", "T1199": "Trusted Relationship",
  "T1200": "Hardware Additions", "T1201": "Password Policy Discovery", "T1202": "Indirect Command Execution",
  "T1203": "Exploitation for Client Execution", "T1204": "User Execution", "T1205": "Traffic Signaling",
  "T1210": "Exploitation of Remote Services", "T1211": "Exploitation for Defense Evasion",
  "T1212": "Exploitation for Credential Access", "T1213": "Data from Information Repositories",
  "T1216": "System Script Proxy Execution", "T1217": "Browser Information Discovery",
  "T1218": "System Binary Proxy Execution", "T1219": "Remote Access Software",
  "T1220": "XSL Script Processing", "T1221": "Template Injection",
  "T1222": "File and Directory Permissions Modification", "T1480": "Execution Guardrails",
  "T1484": "Domain or Tenant Policy Modification", "T1485": "Data Destruction",
  "T1486": "Data Encrypted for Impact", "T1489": "Service Stop", "T1490": "Inhibit System Recovery",
  "T1491": "Defacement", "T1495": "Firmware Corruption", "T1496": "Resource Hijacking",
  "T1497": "Virtualization/Sandbox Evasion", "T1498": "Network Denial of Service",
  "T1499": "Endpoint Denial of Service", "T1505": "Server Software Component",
  "T1518": "Software Discovery", "T1525": "Implant Internal Image",
  "T1526": "Cloud Service Discovery", "T1528": "Steal Application Access Token",
  "T1529": "System Shutdown/Reboot", "T1530": "Data from Cloud Storage",
  "T1531": "Account Access Removal", "T1534": "Internal Spearphishing",
  "T1537": "Transfer Data to Cloud Account", "T1539": "Steal Web Session Cookie",
  "T1542": "Pre-OS Boot", "T1543": "Create or Modify System Process",
  "T1546": "Event Triggered Execution", "T1547": "Boot or Logon Autostart Execution",
  "T1548": "Abuse Elevation Control Mechanism", "T1550": "Use Alternate Authentication Material",
  "T1552": "Unsecured Credentials", "T1553": "Subvert Trust Controls",
  "T1554": "Compromise Client Software Binary", "T1555": "Credentials from Password Stores",
  "T1556": "Modify Authentication Process", "T1557": "Adversary-in-the-Middle",
  "T1558": "Steal or Forge Kerberos Tickets", "T1559": "Inter-Process Communication",
  "T1560": "Archive Collected Data", "T1561": "Disk Wipe", "T1562": "Impair Defenses",
  "T1563": "Remote Service Session Hijacking", "T1564": "Hide Artifacts",
  "T1565": "Data Manipulation", "T1566": "Phishing", "T1567": "Exfiltration Over Web Service",
  "T1568": "Dynamic Resolution", "T1569": "System Services", "T1570": "Lateral Tool Transfer",
  "T1571": "Non-Standard Port", "T1572": "Protocol Tunneling", "T1573": "Encrypted Channel",
  "T1574": "Hijack Execution Flow", "T1580": "Cloud Infrastructure Discovery",
  "T1583": "Acquire Infrastructure", "T1584": "Compromise Infrastructure",
  "T1585": "Establish Accounts", "T1586": "Compromise Accounts", "T1587": "Develop Capabilities",
  "T1588": "Obtain Capabilities", "T1589": "Gather Victim Identity Information",
  "T1590": "Gather Victim Network Information", "T1591": "Gather Victim Org Information",
  "T1592": "Gather Victim Host Information", "T1593": "Search Open Websites/Domains",
  "T1595": "Active Scanning", "T1596": "Search Open Technical Databases",
  "T1598": "Phishing for Information", "T1600": "Weaken Encryption",
  "T1602": "Data from Configuration Repository", "T1606": "Forge Web Credentials",
  "T1608": "Stage Capabilities", "T1609": "Container Administration Command",
  "T1611": "Escape to Host", "T1612": "Build Image on Host",
  "T1613": "Container and Resource Discovery", "T1614": "System Location Discovery",
  "T1615": "Group Policy Discovery", "T1620": "Reflective Code Loading",
  "T1621": "MFA Request Generation", "T1622": "Debugger Evasion",
  // Sub-techniques — T1003
  "T1003.001": "LSASS Memory", "T1003.002": "Security Account Manager",
  "T1003.003": "NTDS", "T1003.004": "LSA Secrets", "T1003.005": "Cached Domain Credentials",
  "T1003.006": "DCSync", "T1003.007": "Proc Filesystem", "T1003.008": "/etc/passwd and /etc/shadow",
  // T1021
  "T1021.001": "Remote Desktop Protocol", "T1021.002": "SMB/Windows Admin Shares",
  "T1021.003": "Distributed Component Object Model", "T1021.004": "SSH",
  "T1021.005": "VNC", "T1021.006": "Windows Remote Management", "T1021.007": "Cloud Services",
  // T1027
  "T1027.001": "Binary Padding", "T1027.002": "Software Packing", "T1027.003": "Steganography",
  "T1027.004": "Compile After Delivery", "T1027.005": "Indicator Removal from Tools",
  "T1027.006": "HTML Smuggling", "T1027.007": "Dynamic API Resolution",
  "T1027.008": "Stripped Payloads", "T1027.009": "Embedded Payloads",
  "T1027.010": "Command Obfuscation", "T1027.011": "Fileless Storage",
  "T1027.012": "LNK Icon Smuggling", "T1027.013": "Encrypted/Encoded File",
  // T1036
  "T1036.001": "Invalid Code Signature", "T1036.002": "Right-to-Left Override",
  "T1036.003": "Rename System Utilities", "T1036.004": "Masquerade Task or Service",
  "T1036.005": "Match Legitimate Name or Location", "T1036.006": "Space after Filename",
  "T1036.007": "Double File Extension", "T1036.008": "Masquerade File Type",
  "T1036.009": "Break Process Trees",
  // T1037
  "T1037.001": "Logon Script (Windows)", "T1037.002": "Login Hook",
  "T1037.003": "Network Logon Script", "T1037.004": "RC Scripts", "T1037.005": "Startup Items",
  // T1053
  "T1053.002": "At", "T1053.003": "Cron", "T1053.004": "Launchd",
  "T1053.005": "Scheduled Task", "T1053.006": "Systemd Timers", "T1053.007": "Container Orchestration Job",
  // T1055
  "T1055.001": "DLL Injection", "T1055.002": "Portable Executable Injection",
  "T1055.003": "Thread Execution Hijacking", "T1055.004": "Asynchronous Procedure Call",
  "T1055.005": "Thread Local Storage", "T1055.008": "Ptrace System Calls",
  "T1055.009": "Proc Memory", "T1055.011": "Extra Window Memory Injection",
  "T1055.012": "Process Hollowing", "T1055.013": "Process Doppelgänging",
  "T1055.014": "VDSO Hijacking", "T1055.015": "ListPlanting",
  // T1056
  "T1056.001": "Keylogging", "T1056.002": "GUI Input Capture",
  "T1056.003": "Web Portal Capture", "T1056.004": "Credential API Hooking",
  // T1059
  "T1059.001": "PowerShell", "T1059.002": "AppleScript", "T1059.003": "Windows Command Shell",
  "T1059.004": "Unix Shell", "T1059.005": "Visual Basic", "T1059.006": "Python",
  "T1059.007": "JavaScript", "T1059.008": "Network Device CLI", "T1059.009": "Cloud API",
  "T1059.010": "AutoHotKey & AutoIT", "T1059.011": "Lua", "T1059.012": "Hypervisor CLI",
  // T1070
  "T1070.001": "Clear Windows Event Logs", "T1070.002": "Clear Linux or Mac System Logs",
  "T1070.003": "Clear Command History", "T1070.004": "File Deletion",
  "T1070.005": "Network Share Connection Removal", "T1070.006": "Timestomp",
  "T1070.007": "Clear Network Connection History", "T1070.008": "Clear Mailbox Data",
  "T1070.009": "Clear Persistence",
  // T1071
  "T1071.001": "Web Protocols", "T1071.002": "File Transfer Protocols",
  "T1071.003": "Mail Protocols", "T1071.004": "DNS",
  // T1078
  "T1078.001": "Default Accounts", "T1078.002": "Domain Accounts",
  "T1078.003": "Local Accounts", "T1078.004": "Cloud Accounts",
  // T1087
  "T1087.001": "Local Account", "T1087.002": "Domain Account",
  "T1087.003": "Email Account", "T1087.004": "Cloud Account",
  // T1090
  "T1090.001": "Internal Proxy", "T1090.002": "External Proxy",
  "T1090.003": "Multi-hop Proxy", "T1090.004": "Domain Fronting",
  // T1098
  "T1098.001": "Additional Cloud Credentials", "T1098.002": "Additional Email Delegate Permissions",
  "T1098.003": "Additional Cloud Roles", "T1098.004": "SSH Authorized Keys",
  "T1098.005": "Device Registration",
  // T1110
  "T1110.001": "Password Guessing", "T1110.002": "Password Cracking",
  "T1110.003": "Password Spraying", "T1110.004": "Credential Stuffing",
  // T1134
  "T1134.001": "Token Impersonation/Theft", "T1134.002": "Create Process with Token",
  "T1134.003": "Make and Impersonate Token", "T1134.004": "Parent PID Spoofing",
  "T1134.005": "SID-History Injection",
  // T1136
  "T1136.001": "Local Account", "T1136.002": "Domain Account", "T1136.003": "Cloud Account",
  // T1195
  "T1195.001": "Compromise Software Dependencies", "T1195.002": "Compromise Software Supply Chain",
  "T1195.003": "Compromise Hardware Supply Chain",
  // T1204
  "T1204.001": "Malicious Link", "T1204.002": "Malicious File", "T1204.003": "Malicious Image",
  // T1218
  "T1218.001": "Compiled HTML File", "T1218.002": "Control Panel", "T1218.003": "CMSTP",
  "T1218.004": "InstallUtil", "T1218.005": "Mshta", "T1218.007": "Msiexec",
  "T1218.008": "Odbcconf", "T1218.009": "Regsvcs/Regasm", "T1218.010": "Regsvr32",
  "T1218.011": "Rundll32", "T1218.012": "Verclsid", "T1218.013": "Mavinject", "T1218.014": "MMC",
  // T1484
  "T1484.001": "Group Policy Modification", "T1484.002": "Trust Modification",
  // T1505
  "T1505.001": "SQL Stored Procedures", "T1505.002": "Transport Agent",
  "T1505.003": "Web Shell", "T1505.004": "IIS Components", "T1505.005": "Terminal Services DLL",
  // T1518
  "T1518.001": "Security Software Discovery",
  // T1542
  "T1542.001": "System Firmware", "T1542.002": "Component Firmware", "T1542.003": "Bootkit",
  "T1542.004": "ROMMONkit", "T1542.005": "TFTP Boot",
  // T1543
  "T1543.001": "Launch Agent", "T1543.002": "Systemd Service",
  "T1543.003": "Windows Service", "T1543.004": "Launch Daemon",
  // T1546
  "T1546.001": "Change Default File Association", "T1546.002": "Screensaver",
  "T1546.003": "WMI Event Subscription", "T1546.004": "Unix Shell Configuration Modification",
  "T1546.005": "Trap", "T1546.006": "LC_LOAD_DYLIB Addition", "T1546.007": "Netsh Helper DLL",
  "T1546.008": "Accessibility Features", "T1546.009": "AppCert DLLs",
  "T1546.010": "AppInit DLLs", "T1546.011": "Application Shimming",
  "T1546.012": "Image File Execution Options Injection", "T1546.013": "PowerShell Profile",
  "T1546.014": "Emond", "T1546.015": "Component Object Model Hijacking",
  "T1546.016": "Installer Packages",
  // T1547
  "T1547.001": "Registry Run Keys / Startup Folder", "T1547.002": "Authentication Package",
  "T1547.003": "Time Providers", "T1547.004": "Winlogon Helper DLL",
  "T1547.005": "Security Support Provider", "T1547.006": "Kernel Modules and Extensions",
  "T1547.007": "Re-opened Applications", "T1547.008": "LSASS Driver",
  "T1547.009": "Shortcut Modification", "T1547.010": "Port Monitors",
  "T1547.011": "Plist Modification", "T1547.012": "Print Processors",
  "T1547.013": "XDG Autostart Entries", "T1547.014": "Active Setup", "T1547.015": "Login Items",
  // T1548
  "T1548.001": "Setuid and Setgid", "T1548.002": "Bypass User Account Control",
  "T1548.003": "Sudo and Sudo Caching", "T1548.004": "Elevated Execution with Prompt",
  "T1548.005": "Temporary Elevated Cloud Access", "T1548.006": "TCC Manipulation",
  // T1550
  "T1550.001": "Application Access Token", "T1550.002": "Pass the Hash",
  "T1550.003": "Pass the Ticket", "T1550.004": "Web Session Cookie",
  // T1552
  "T1552.001": "Credentials In Files", "T1552.002": "Credentials in Registry",
  "T1552.003": "Bash History", "T1552.004": "Private Keys",
  "T1552.005": "Cloud Instance Metadata API", "T1552.006": "Group Policy Preferences",
  "T1552.007": "Container API", "T1552.008": "Chat Messages",
  // T1553
  "T1553.001": "Gatekeeper Bypass", "T1553.002": "Code Signing",
  "T1553.003": "SIP and Trust Provider Hijacking", "T1553.004": "Install Root Certificate",
  "T1553.005": "Mark-of-the-Web Bypass", "T1553.006": "Code Signing Policy Modification",
  // T1555
  "T1555.001": "Keychain", "T1555.002": "Securityd Memory",
  "T1555.003": "Credentials from Web Browsers", "T1555.004": "Windows Credential Manager",
  "T1555.005": "Password Managers", "T1555.006": "Cloud Secrets Management Stores",
  // T1556
  "T1556.001": "Domain Controller Authentication", "T1556.002": "Password Filter DLL",
  "T1556.003": "Pluggable Authentication Modules", "T1556.004": "Network Device Authentication",
  "T1556.005": "Reversible Encryption", "T1556.006": "Multi-Factor Authentication",
  "T1556.007": "Hybrid Identity", "T1556.008": "Network Provider DLL",
  "T1556.009": "Conditional Access Policies",
  // T1558
  "T1558.001": "Golden Ticket", "T1558.002": "Silver Ticket",
  "T1558.003": "Kerberoasting", "T1558.004": "AS-REP Roasting", "T1558.005": "Ccache Files",
  // T1559
  "T1559.001": "Component Object Model", "T1559.002": "Dynamic Data Exchange",
  "T1559.003": "XPC Services",
  // T1560
  "T1560.001": "Archive via Utility", "T1560.002": "Archive via Library",
  "T1560.003": "Archive via Custom Method",
  // T1562
  "T1562.001": "Disable or Modify Tools", "T1562.002": "Disable Windows Event Logging",
  "T1562.003": "Impair Command History Logging", "T1562.004": "Disable or Modify System Firewall",
  "T1562.006": "Indicator Blocking", "T1562.007": "Disable or Modify Cloud Firewall",
  "T1562.008": "Disable Cloud Logs", "T1562.009": "Safe Mode Boot",
  "T1562.010": "Downgrade Attack", "T1562.011": "Spoof Security Alerting",
  "T1562.012": "Disable or Modify Linux Audit System",
  // T1564
  "T1564.001": "Hidden Files and Directories", "T1564.002": "Hidden Users",
  "T1564.003": "Hidden Window", "T1564.004": "NTFS File Attributes",
  "T1564.005": "Hidden File System", "T1564.006": "Run Virtual Instance",
  "T1564.007": "VBA Stomping", "T1564.008": "Email Hiding Rules",
  "T1564.009": "Resource Forking", "T1564.010": "Process Argument Spoofing",
  "T1564.011": "Ignore Process Interrupts", "T1564.012": "File/Path Exclusions",
  // T1566
  "T1566.001": "Spearphishing Attachment", "T1566.002": "Spearphishing Link",
  "T1566.003": "Spearphishing via Service", "T1566.004": "Spearphishing Voice",
  // T1567
  "T1567.001": "Exfiltration to Code Repository", "T1567.002": "Exfiltration to Cloud Storage",
  "T1567.003": "Exfiltration to Text Storage Sites", "T1567.004": "Exfiltration Over Webhook",
  // T1568
  "T1568.001": "Fast Flux DNS", "T1568.002": "Domain Generation Algorithms",
  "T1568.003": "DNS Calculation",
  // T1569
  "T1569.001": "Launchctl", "T1569.002": "Service Execution",
  // T1574
  "T1574.001": "DLL Search Order Hijacking", "T1574.002": "DLL Side-Loading",
  "T1574.004": "Dylib Hijacking", "T1574.005": "Executable Installer File Permissions Weakness",
  "T1574.006": "Dynamic Linker Hijacking", "T1574.007": "Path Interception by PATH Environment Variable",
  "T1574.008": "Path Interception by Search Order Hijacking",
  "T1574.009": "Path Interception by Unquoted Path", "T1574.010": "Services File Permissions Weakness",
  "T1574.011": "Services Registry Permissions Weakness", "T1574.012": "COR_PROFILER",
  "T1574.013": "KernelCallbackTable", "T1574.014": "AppDomainManager",
};

function enrichTechnique(value: string): string {
  const upper = value.toUpperCase();
  // Check full sub-technique first (e.g. T1055.013), then base (e.g. T1055)
  const name = MITRE_TECHNIQUES[upper] ?? MITRE_TECHNIQUES[upper.match(/^(T\d{4})/)?.[1] ?? ""];
  return name ? `${value} — ${name}` : value;
}

// Maps widget time_range values to CBC investigate searchWindow enum
const SEARCH_WINDOW: Record<string, string> = {
  "-1h":  "ONE_HOUR",
  "-4h":  "FOUR_HOURS",
  "-1d":  "ONE_DAY",
  "-3d":  "THREE_DAYS",
  "-1w":  "ONE_WEEK",
  "-2w":  "TWO_WEEKS",
  "-30d": "ONE_MONTH",
};

function cbcUrl(creds: Credentials, groupBy: string, label: string, dataSource: string, timeRange?: string): string {
  const host = creds.hostname.replace(/\/$/, "");
  const base = host.startsWith("http") ? host : `https://${host}`;
  // Escape backslashes in label so CBC query parser treats them as literals
  const escapedLabel = label.replace(/\\/g, "\\\\");
  // Alerts-style: field:"value" with s[c][query_string]
  const qAlerts = encodeURIComponent(`${groupBy}:"${escapedLabel}"`);
  const tr = timeRange ? `&s[c][time_range][value]=${encodeURIComponent(timeRange)}` : "";
  // Investigate-style: field:"value" with query= and searchWindow=
  const qInv = encodeURIComponent(`${groupBy}:"${escapedLabel}"`);
  const win = SEARCH_WINDOW[timeRange ?? ""] ?? "THREE_DAYS";

  switch (dataSource) {
    case "devices":
      // /inventory/endpoints uses s[query]=field:value syntax
      return `${base}/inventory/endpoints?s[query]=${encodeURIComponent(`${groupBy}:${escapedLabel}`)}`;
    case "observations":
      return `${base}/cb/investigate/observations?searchWindow=${win}&query=${qInv}`;
    case "process_search":
      return `${base}/cb/investigate/processes?searchWindow=${win}&query=${qInv}`;
    case "vulnerability_assessment":
      return `${base}/vulnerabilities?s[c][query_string]=${qAlerts}&orgKey=${creds.org_key}`;
    case "audit_logs":
      return `${base}/settings/auditlog?s[searchWindow]=${win}&s[sortDefinition][fieldName]=TIME&s[sortDefinition][sortOrder]=DESC&s[c][VERBOSE_ENTRIES][0]=false&s[c][QUERY_STRING_TYPE][0]=${encodeURIComponent(label)}`;
    default: // alerts
      return `${base}/alerts?s[c][query_string]=${qAlerts}${tr}&orgKey=${creds.org_key}`;
  }
}

// ---------------------------------------------------------------------------
// Error boundary — isolates render errors to a single widget
// ---------------------------------------------------------------------------

interface BoundaryState { error: string | null }

class WidgetErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 12, color: "var(--red)", fontSize: 12 }}>
          Widget error: {this.state.error}
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// WidgetCard
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Three-dot menu
// ---------------------------------------------------------------------------

interface MenuProps {
  onEdit: () => void;
  onDelete: () => void;
  dashboards: Dashboard[];
  currentDashboardId: number | null;
  onMove: (dashboardId: number) => void;
  onCopy: (dashboardId: number) => void;
}

function ThreeDotMenu({ onEdit, onDelete, dashboards, currentDashboardId, onMove, onCopy }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [page, setPage] = useState<"main" | "move" | "copy">("main");
  const btnRef = useRef<HTMLButtonElement>(null);

  const otherDashboards = dashboards.filter(d => d.id !== currentDashboardId);

  const openMenu = () => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, left: rect.right - 160 });
    setPage("main");
    setOpen(true);
  };

  const close = () => { setOpen(false); setPage("main"); };

  useEffect(() => {
    if (!open) return;
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    background: "var(--bg-dark)",
    border: "1px solid var(--border)",
    borderRadius: 3,
    boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
    zIndex: 9999,
    minWidth: 160,
  };

  const item = (label: string, onClick: () => void, danger = false, arrow = false) => (
    <div
      key={label}
      onMouseDown={e => { e.stopPropagation(); onClick(); }}
      style={{
        padding: "6px 12px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
        color: danger ? "var(--red)" : "var(--text)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-raised)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      {label}
      {arrow && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>▶</span>}
    </div>
  );

  const divider = <div style={{ borderTop: "1px solid var(--border)" }} />;

  const backHeader = (label: string) => (
    <div
      onMouseDown={e => { e.stopPropagation(); setPage("main"); }}
      style={{
        padding: "6px 12px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
        color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6,
        borderBottom: "1px solid var(--border)",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-raised)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      <span>◀</span> {label}
    </div>
  );

  return (
    <>
      <button
        ref={btnRef}
        onMouseDown={e => { e.stopPropagation(); openMenu(); }}
        style={{ ...headerBtn, fontSize: 16, letterSpacing: 1, padding: "0 6px" }}
        title="Options"
      >···</button>

      {open && menuPos && createPortal(
        <div style={{ ...menuStyle, top: menuPos.top, left: menuPos.left }}
          onMouseDown={e => e.stopPropagation()}>
          {page === "main" && <>
            {item("Edit", () => { onEdit(); close(); })}
            {divider}
            {item("Move to…", () => setPage("move"), false, otherDashboards.length > 0)}
            {item("Copy to…", () => setPage("copy"), false, otherDashboards.length > 0)}
            {divider}
            {item("Delete", () => { onDelete(); close(); }, true)}
          </>}

          {page === "move" && <>
            {backHeader("Move to…")}
            {otherDashboards.length === 0
              ? <div style={{ padding: "6px 12px", fontSize: 12, color: "var(--text-muted)" }}>No other dashboards</div>
              : otherDashboards.map(d => item(d.name, () => { onMove(d.id); close(); }))}
          </>}

          {page === "copy" && <>
            {backHeader("Copy to…")}
            {otherDashboards.length === 0
              ? <div style={{ padding: "6px 12px", fontSize: 12, color: "var(--text-muted)" }}>No other dashboards</div>
              : otherDashboards.map(d => item(d.name, () => { onCopy(d.id); close(); }))}
          </>}
        </div>,
        document.body
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// WidgetCard
// ---------------------------------------------------------------------------

interface Props {
  widget: Widget;
  creds: Credentials | null;
  dashboards: Dashboard[];
  onEdit: () => void;
  onDelete: () => void;
  onMove: (dashboardId: number) => void;
  onCopy: (dashboardId: number) => void;
}

export default function WidgetCard({ widget, creds, dashboards, onEdit, onDelete, onMove, onCopy }: Props) {
  const [result, setResult] = useState<WidgetData | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetch = () => getWidgetData(widget.id).then(d => { if (!cancelled) setResult(d); });
    fetch();
    const interval = setInterval(fetch, Math.max(widget.poll_interval * 1000, 5000));
    return () => { cancelled = true; clearInterval(interval); };
  }, [widget.id, widget.poll_interval]);

  const rawData = result?.data as Array<{ label: string } & Record<string, unknown>> | null;
  const data = rawData?.map(d => ({
    ...d,
    displayLabel: widget.group_by === "attack_technique"
      ? enrichTechnique(String(d.label))
      : maybeBasename(widget.group_by, String(d.label)),
  })) ?? null;
  const valueLabel = widget.agg_field && widget.agg_func !== "count"
    ? `${widget.agg_func}(${widget.agg_field})`
    : "count";

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: 4,
      overflow: "hidden",
    }}>
      {/* Card header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "0 12px",
        background: "var(--bg-dark)",
        borderBottom: "1px solid var(--border)",
        height: 36,
        flexShrink: 0,
      }}>
        <span
          className="drag-handle"
          style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", cursor: "grab", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {widget.title}
        </span>
        <div style={{ flexShrink: 0 }} onMouseDown={e => e.stopPropagation()}>
          <ThreeDotMenu
            onEdit={onEdit}
            onDelete={onDelete}
            dashboards={dashboards}
            currentDashboardId={widget.dashboard_id}
            onMove={onMove}
            onCopy={onCopy}
          />
        </div>
      </div>

      {/* Card body */}
      <div style={{ flex: 1, padding: 8, overflow: "auto", minHeight: 0 }}>
        <WidgetErrorBoundary>
          {!result && <div style={mutedStyle}>Loading…</div>}
          {result?.status === "pending" && <div style={mutedStyle}>Waiting for first poll…</div>}
          {result?.status === "error" && (
            <div style={{ color: "var(--red)", fontSize: 12, padding: 8 }}>{result.error}</div>
          )}
          {result?.status === "ok" && data && (
            <>
              {widget.chart_style === "list" && <ListChart data={result.data as Record<string, unknown>[]} creds={creds} groupBy={widget.group_by} dataSource={widget.data_source} columns={widget.list_columns} valueLabel={valueLabel} timeRange={widget.time_range} />}
              {widget.chart_style === "pie" && <PieViz data={data} creds={creds} groupBy={widget.group_by} dataSource={widget.data_source} valueLabel={valueLabel} timeRange={widget.time_range} />}
              {widget.chart_style === "bar" && <BarViz data={data} creds={creds} groupBy={widget.group_by} dataSource={widget.data_source} valueLabel={valueLabel} timeRange={widget.time_range} barSplitBy={widget.bar_split_by} />}
              {widget.chart_style === "line" && <LineViz data={data} creds={creds} groupBy={widget.group_by} dataSource={widget.data_source} valueLabel={valueLabel} timeRange={widget.time_range} />}
            </>
          )}
        </WidgetErrorBoundary>
      </div>

      {/* Footer */}
      {result?.last_updated && (
        <div style={{
          fontSize: 10, color: "var(--text-muted)",
          padding: "3px 12px 4px",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-dark)",
          flexShrink: 0,
        }}>
          Updated: {new Date(result.last_updated).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart components
// ---------------------------------------------------------------------------

// label and displayLabel are always present; count is present for regular charts,
// numeric series keys are present for stacked bar / multi-series line charts.
type ChartRow = { label: string; displayLabel: string } & Record<string, unknown>;

interface ChartProps {
  data: ChartRow[];
  creds: Credentials | null;
  groupBy: string;
  dataSource: string;
  valueLabel: string;
  timeRange?: string;
}

function ListChart({ data, creds, groupBy, dataSource, columns, valueLabel, timeRange }: { data: Record<string, unknown>[]; creds: Credentials | null; groupBy: string; dataSource: string; columns?: string[] | null; valueLabel: string; timeRange?: string }) {
  if (!data.length) return <div style={mutedStyle}>No results</div>;
  const allKeys = Object.keys(data[0]);
  const filtered = columns && columns.length > 0 ? columns.filter(c => allKeys.includes(c)) : [];
  const keys = filtered.length > 0 ? filtered : allKeys;
  return (
    <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", color: "var(--text)" }}>
      <thead>
        <tr style={{ background: "var(--bg-dark)" }}>
          {keys.map(k => (
            <th key={k} style={{
              textAlign: "left", padding: "5px 8px",
              borderBottom: "1px solid var(--border)",
              color: "var(--text-muted)", fontWeight: 600,
              fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4,
            }}>{k === "label" ? groupBy : k === "count" ? valueLabel : k}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => {
          const rawVal = String(row["label"] ?? row[groupBy] ?? "");
          const link = creds ? cbcUrl(creds, groupBy, rawVal, dataSource, timeRange) : null;
          return (
            <tr key={i} style={{ background: i % 2 ? "var(--bg-raised)" : "transparent", borderBottom: "1px solid var(--border)" }}>
              {keys.map(k => (
                <td key={k} style={{ padding: "4px 8px" }}>
                  {(k === "label" || k === groupBy) && link
                    ? <a href={link} target="_blank" rel="noreferrer" style={{ color: "var(--blue-link)", textDecoration: "none" }}>
                        {groupBy === "attack_technique"
                          ? enrichTechnique(String(row[k] ?? ""))
                          : maybeBasename(groupBy, String(row[k] ?? ""))}
                      </a>
                    : String(row[k] ?? "")}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const tooltipStyle = {
  contentStyle: { background: "var(--bg-dark)", border: "1px solid var(--border)", borderRadius: 3, fontSize: 12 },
  labelStyle: { color: "var(--text-muted)" },
  itemStyle: { color: "var(--text)" },
};

function PieViz({ data, creds, groupBy, dataSource, valueLabel, timeRange }: ChartProps) {
  // Pie always uses the "count" key (non-stacked data source)
  const pieData = data.map(d => ({ ...d, count: Number(d.count ?? 0) }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart margin={{ top: 16, right: 40, bottom: 16, left: 40 }}>
        <Pie
          data={pieData}
          dataKey="count"
          nameKey="displayLabel"
          cx="50%"
          cy="50%"
          outerRadius="55%"
          onClick={(entry: { name?: string; payload?: { label: string } }) => {
            if (!creds) return;
            const raw = entry.payload?.label ?? entry.name ?? "";
            if (raw) window.open(cbcUrl(creds, groupBy, raw, dataSource, timeRange), "_blank");
          }}
          style={{ cursor: creds ? "pointer" : "default" }}
          label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
          labelLine={true}
        >
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip {...tooltipStyle} formatter={(v) => [v, valueLabel]} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function BarViz({ data, creds, groupBy, dataSource, valueLabel, timeRange }: ChartProps & { barSplitBy?: string | null }) {
  const maxLen = Math.max(...data.map(d => String(d.displayLabel).length), 1);
  // height on XAxis (not margin.bottom on BarChart) is what reserves space for rotated tick labels.
  // At -90° the label "height" needed = label text width ≈ chars × 6.5px.
  const tickAreaHeight = Math.min(maxLen * 7, 160);

  // Stacked mode: data rows have series keys instead of a single "count" key
  const seriesKeys = data.length > 0
    ? Object.keys(data[0]).filter(k => k !== "label" && k !== "displayLabel" && k !== "count").sort()
    : [];
  const isStacked = seriesKeys.length > 0;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: isStacked ? 16 : 8, bottom: 20, left: 40 }}>
        <XAxis
          dataKey="displayLabel"
          tick={{ fill: "#6a7f9c", fontSize: 11 }}
          angle={-40}
          textAnchor="end"
          interval={0}
          height={tickAreaHeight}
        />
        <YAxis
          tick={{ fill: "#6a7f9c", fontSize: 11 }}
          label={{ value: isStacked ? "count" : valueLabel, angle: -90, position: "insideLeft", offset: 10, fill: "#6a7f9c", fontSize: 11 }}
        />
        <Tooltip {...tooltipStyle} labelFormatter={(l) => l} />
        {isStacked
          ? seriesKeys.map((key, i) => (
              <Bar key={key} dataKey={key} stackId="stack" fill={COLORS[i % COLORS.length]} name={key} />
            ))
          : (
            <Bar
              dataKey="count"
              onClick={(entry) => {
                if (creds) window.open(cbcUrl(creds, groupBy, (entry as unknown as { label: string }).label, dataSource, timeRange), "_blank");
              }}
              style={{ cursor: creds ? "pointer" : "default" }}
            >
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          )
        }
        {isStacked && <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />}
      </BarChart>
    </ResponsiveContainer>
  );
}

function LineViz({ data, valueLabel }: ChartProps) {
  // Line chart shows events bucketed over time — labels are time buckets, not categories
  const maxLen = Math.max(...data.map(d => d.displayLabel.length), 0);
  const bottomMargin = Math.min(maxLen * 4, 80) + 20;

  // Detect multi-series: if data rows have keys other than label/displayLabel/count
  const seriesKeys = data.length > 0
    ? Object.keys(data[0]).filter(k => k !== "label" && k !== "displayLabel" && k !== "count").sort()
    : [];
  const isMultiSeries = seriesKeys.length > 0;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: isMultiSeries ? 16 : 8, bottom: bottomMargin, left: 40 }}>
        <XAxis
          dataKey="displayLabel"
          tick={{ fill: "#6a7f9c", fontSize: 11 }}
          angle={-35}
          textAnchor="end"
          interval={0}
          label={{ value: "Time", position: "insideBottom", offset: -bottomMargin + 16, fill: "#6a7f9c", fontSize: 11 }}
        />
        <YAxis
          tick={{ fill: "#6a7f9c", fontSize: 11 }}
          label={{ value: valueLabel, angle: -90, position: "insideLeft", offset: 10, fill: "#6a7f9c", fontSize: 11 }}
        />
        <Tooltip {...tooltipStyle} />
        {isMultiSeries
          ? seriesKeys.map((key, i) => (
              <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} dot={{ r: 3, fill: COLORS[i % COLORS.length] }} name={key} />
            ))
          : <Line type="monotone" dataKey="count" stroke="#4a9fd4" dot={{ r: 3, fill: "#4a9fd4" }} name={valueLabel} />
        }
        {isMultiSeries && <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />}
      </LineChart>
    </ResponsiveContainer>
  );
}

const headerBtn: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  color: "var(--blue-link)", fontSize: 12, padding: "2px 4px", fontFamily: "inherit",
};
const mutedStyle: React.CSSProperties = { color: "var(--text-muted)", fontSize: 13, padding: 8 };
