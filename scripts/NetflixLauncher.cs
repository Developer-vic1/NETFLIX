using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

internal static class NetflixLauncher
{
    [STAThread]
    private static void Main()
    {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string server = Path.Combine(root, "scripts", "serve.py");
        if (!File.Exists(server))
        {
            MessageBox.Show("Coloca Netflix.exe en la carpeta principal del proyecto, junto a index.html y scripts.", "Netflix local");
            return;
        }
        const string address = "http://127.0.0.1:4173/#/home";
        if (!Ready())
        {
            bool started = Start("py", "-3") || Start("python", "");
            if (!started)
            {
                MessageBox.Show("No se encontró Python. Instálalo o ejecuta: python scripts/serve.py", "Netflix local");
                return;
            }
            for (int attempt = 0; attempt < 40 && !Ready(); attempt++) Thread.Sleep(250);
            if (!Ready())
            {
                MessageBox.Show("No se pudo iniciar el servidor local en 127.0.0.1:4173. Revisa si el puerto está ocupado.", "Netflix local");
                return;
            }
        }
        Process.Start(new ProcessStartInfo(address) { UseShellExecute = true });
    }

    private static bool Start(string program, string prefix)
    {
        try
        {
            Process process = Process.Start(new ProcessStartInfo(program, prefix + " scripts/serve.py")
            {
                WorkingDirectory = AppDomain.CurrentDomain.BaseDirectory,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
            });
            return process != null;
        }
        catch { return false; }
    }

    private static bool Ready()
    {
        try
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:4173/index.html");
            request.Timeout = 600;
            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                return response.StatusCode == HttpStatusCode.OK && response.Headers["X-Netflix-Local"] == "1";
        }
        catch { return false; }
    }
}
