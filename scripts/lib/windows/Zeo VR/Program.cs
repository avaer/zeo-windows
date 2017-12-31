using System;
using System.IO;
using System.Diagnostics;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Zeo_VR
{
    class Program
    {
        static void Main(string[] args)
        {
            Process cmd = new Process();

            String rootDirectory = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..", "..", ".."));
            cmd.StartInfo.FileName = Path.Combine(rootDirectory, "node_modules", "electron", "dist", "electron.exe");
            Console.WriteLine(cmd.StartInfo.FileName);
            cmd.StartInfo.Arguments = rootDirectory + " " + "url=https://my.zeovr.io/";
            cmd.StartInfo.CreateNoWindow = false;
            cmd.StartInfo.UseShellExecute = false;

            cmd.Start();
            cmd.WaitForExit();

            if (cmd.ExitCode != 0) {
                Console.WriteLine("Error starting app. Press any key to continue.");
                Console.ReadKey();
            }
        }
    }
}
