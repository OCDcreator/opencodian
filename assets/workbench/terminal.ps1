# Native Windows ConPTY bridge. It never changes the user's execution policy.
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public sealed class OpenCodianPseudoTerminal : IDisposable {
  [StructLayout(LayoutKind.Sequential)] struct Coord { public short X, Y; public Coord(short x, short y) { X=x; Y=y; } }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct StartupInfo {
    public int cb; public string reserved, desktop, title;
    public int x,y,xSize,ySize,xChars,yChars,fill,flags; public short show,cbReserved;
    public IntPtr reserved2,input,output,error;
  }
  [StructLayout(LayoutKind.Sequential)] struct StartupInfoEx { public StartupInfo info; public IntPtr attributes; }
  [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr process,thread; public int processId,threadId; }
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool CreatePipe(out IntPtr read,out IntPtr write,IntPtr security,int size);
  [DllImport("kernel32.dll")] static extern int CreatePseudoConsole(Coord size,IntPtr input,IntPtr output,uint flags,out IntPtr console);
  [DllImport("kernel32.dll")] static extern int ResizePseudoConsole(IntPtr console,Coord size);
  [DllImport("kernel32.dll")] static extern void ClosePseudoConsole(IntPtr console);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,int flags,ref IntPtr size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
  [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool CreateProcess(string app,StringBuilder command,IntPtr processAttributes,IntPtr threadAttributes,bool inherit,uint flags,IntPtr environment,string cwd,ref StartupInfoEx startup,out ProcessInfo process);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool ReadFile(IntPtr file,byte[] data,int size,out int read,IntPtr overlapped);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool WriteFile(IntPtr file,byte[] data,int size,out int written,IntPtr overlapped);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
  [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
  [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process,uint code);
  IntPtr console,input,output,process;
  bool closed;
  readonly object lifecycle = new object();
  static readonly object writer = new object();
  static readonly StreamWriter controlOutput = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
  static void Emit(string json) { lock(writer) { controlOutput.WriteLine(json); controlOutput.Flush(); } }
  static void Require(bool success) { if(!success) throw new Win32Exception(Marshal.GetLastWin32Error()); }
  public void Start(string cwd) {
    IntPtr childInput=IntPtr.Zero, childOutput=IntPtr.Zero, attributes=IntPtr.Zero;
    try {
      Require(CreatePipe(out childInput,out input,IntPtr.Zero,0));
      Require(CreatePipe(out output,out childOutput,IntPtr.Zero,0));
      Marshal.ThrowExceptionForHR(CreatePseudoConsole(new Coord(80,24),childInput,childOutput,0,out console));
      IntPtr size=IntPtr.Zero;
      InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref size);
      attributes=Marshal.AllocHGlobal(size);
      Require(InitializeProcThreadAttributeList(attributes,1,0,ref size));
      Require(UpdateProcThreadAttribute(attributes,0,new IntPtr(0x00020016),console,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero));
      StartupInfoEx startup=new StartupInfoEx(); startup.info.cb=Marshal.SizeOf(typeof(StartupInfoEx)); startup.info.flags=0x00000100; startup.attributes=attributes;
      ProcessInfo info;
      string shell=Environment.GetEnvironmentVariable("ComSpec") ?? "cmd.exe";
      Require(CreateProcess(shell,new StringBuilder("\""+shell+"\" /d"),IntPtr.Zero,IntPtr.Zero,false,0x00080000,IntPtr.Zero,cwd,ref startup,out info));
      process=info.process; CloseHandle(info.thread);
      Thread reader=new Thread(ReadOutput); reader.IsBackground=true; reader.Start();
      Thread waiter=new Thread(delegate() { WaitForSingleObject(process,0xffffffff); uint code; GetExitCodeProcess(process,out code); Emit("{\"type\":\"exit\",\"code\":"+code+"}"); });
      waiter.IsBackground=true; waiter.Start();
      Emit("{\"type\":\"ready\",\"pid\":"+info.processId+"}");
    } catch { Dispose(); throw; }
    finally {
      if(childInput!=IntPtr.Zero) CloseHandle(childInput);
      if(childOutput!=IntPtr.Zero) CloseHandle(childOutput);
      if(attributes!=IntPtr.Zero) { DeleteProcThreadAttributeList(attributes); Marshal.FreeHGlobal(attributes); }
    }
  }
  void ReadOutput() {
    byte[] bytes=new byte[32768]; int count;
    while(ReadFile(output,bytes,bytes.Length,out count,IntPtr.Zero) && count>0)
      Emit("{\"type\":\"data\",\"data\":\""+Convert.ToBase64String(bytes,0,count)+"\"}");
  }
  public void Write(string text) { byte[] bytes=Encoding.UTF8.GetBytes(text); int count; if(!closed) Require(WriteFile(input,bytes,bytes.Length,out count,IntPtr.Zero)); }
  public void Resize(int cols,int rows) { if(!closed) Marshal.ThrowExceptionForHR(ResizePseudoConsole(console,new Coord((short)Math.Max(2,Math.Min(500,cols)),(short)Math.Max(2,Math.Min(300,rows))))); }
  public void Dispose() {
    lock(lifecycle) {
      if(closed) return; closed=true;
      if(console!=IntPtr.Zero) { ClosePseudoConsole(console); console=IntPtr.Zero; }
      if(process!=IntPtr.Zero) { if(WaitForSingleObject(process,1000)!=0) TerminateProcess(process,1); CloseHandle(process); process=IntPtr.Zero; }
      if(input!=IntPtr.Zero) CloseHandle(input);
      if(output!=IntPtr.Zero) CloseHandle(output);
    }
  }
}
'@
$terminal = New-Object OpenCodianPseudoTerminal
$controlInput = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8)
try {
  $terminal.Start($env:OPENCODIAN_WORKBENCH_CWD)
  while ($null -ne ($line = $controlInput.ReadLine())) {
    $message = $line | ConvertFrom-Json
    if ($message.type -eq 'input') { $terminal.Write([string]$message.data) }
    elseif ($message.type -eq 'resize') { $terminal.Resize([int]$message.cols, [int]$message.rows) }
    elseif ($message.type -eq 'close') { break }
  }
} finally { $terminal.Dispose() }
