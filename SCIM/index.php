<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Great Solomon Supply Chain Services Inc. - SCIM Dashboard</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --primary: #4f46e5;
            --primary-hover: #4338ca;
            --bg-light: #f8fafc;
            --sidebar-width: 260px;
            --sidebar-collapsed: 72px;
            --text-main: #1e293b;
            --border-color: #e2e8f0;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
        body { background-color: var(--bg-light); color: var(--text-main); display: flex; height: 100vh; overflow: hidden; }
        aside { width: var(--sidebar-width); background: #ffffff; border-right: 1px solid var(--border-color); display: flex; flex-direction: column; transition: width 0.3s ease; z-index: 100; }
        .brand-box { padding: 20px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--border-color); }
        .brand-logo { width: 36px; height: 36px; background: var(--primary); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; }
        .brand-text { font-size: 14px; font-weight: 700; white-space: nowrap; }
        .nav-links { list-style: none; padding: 15px 10px; flex-grow: 1; }
        .nav-links li { margin-bottom: 8px; }
        .nav-links a { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: 8px; color: #64748b; text-decoration: none; font-weight: 500; transition: 0.2s; }
        .nav-links a:hover, .nav-links a.active { background: #eef2ff; color: var(--primary); }
        .main-container { flex-grow: 1; display: flex; flex-direction: column; overflow: hidden; }
        header { height: 70px; background: #ffffff; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; padding: 0 24px; }
        .content-body { padding: 30px; overflow-y: auto; flex-grow: 1; }
        .card { background: white; border: 1px solid var(--border-color); border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    </style>
</head>
<body>
    <aside>
        <div class="brand-box">
            <div class="brand-logo">SC</div>
            <div class="brand-text">Supply Chain System</div>
        </div>
        <ul class="nav-links">
            <li><a href="#" class="active"><i class="fa-solid fa-chart-pie"></i><span>Dashboard</span></a></li>
            <li><a href="#"><i class="fa-solid fa-boxes-stacked"></i><span>Inventory</span></a></li>
            <li><a href="#"><i class="fa-solid fa-warehouse"></i><span>Warehouse</span></a></li>
            <li><a href="#"><i class="fa-solid fa-shield-halved"></i><span>Auth & Users</span></a></li>
        </ul>
    </aside>
    <div class="main-container">
        <header>
            <h2>Dashboard Overview</h2>
            <div style="font-weight: 600; color: var(--primary);">System Online (Dockerized)</div>
        </header>
        <div class="content-body">
            <div class="card">
                <h3>Welcome to SCIM Fullstack Application</h3>
                <p style="margin-top: 10px; color: #64748b;">Your single-container deployment is successfully running on HostForge with Apache and PHP!</p>
            </div>
        </div>
    </div>
</body>
</html>
