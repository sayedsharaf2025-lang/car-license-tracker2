// إدارة حالة التطبيق
const AppState = {
    currentUser: null,
    cars: [],
    expenses: [],
    amanah: [],
    currentSection: 'overview'
};

// تهيئة التطبيق
function init() {
    checkAuthState();
    setupEventListeners();
    setupDefaultData();
}

// إعداد بيانات افتراضية للتجربة
function setupDefaultData() {
    if (!localStorage.getItem('defaultDataSetup')) {
        const sampleCars = [
            {
                id: '1',
                plateNumber: 'ص ع 1234',
                model: 'تويوتا كامري',
                year: '2020',
                licenseExpiry: '2024-12-15',
                cost: '1200',
                createdAt: new Date().toISOString()
            },
            {
                id: '2',
                plateNumber: 'ص ب 5678',
                model: 'هيونداي النترا',
                year: '2019',
                licenseExpiry: '2025-01-20',
                cost: '800',
                createdAt: new Date().toISOString()
            }
        ];

        const sampleExpenses = [
            {
                id: '1',
                carId: '1',
                type: 'ترخيص',
                amount: 1200,
                date: '2024-01-15',
                description: 'تجديد رخصة سنوية',
                createdAt: new Date().toISOString()
            },
            {
                id: '2',
                carId: '2',
                type: 'ترخيص',
                amount: 800,
                date: '2024-01-20',
                description: 'تجديد رخصة سنوية',
                createdAt: new Date().toISOString()
            }
        ];

        const sampleAmanah = [
            {
                id: '1',
                type: 'credit',
                amount: 5000,
                date: '2024-01-01',
                description: 'إيداع مبدئي',
                balance: 5000,
                createdAt: new Date().toISOString()
            },
            {
                id: '2',
                type: 'debit',
                amount: 2000,
                date: '2024-01-15',
                description: 'دفع تراخيص السيارات',
                balance: 3000,
                createdAt: new Date().toISOString()
            }
        ];

        localStorage.setItem('sampleCars', JSON.stringify(sampleCars));
        localStorage.setItem('sampleExpenses', JSON.stringify(sampleExpenses));
        localStorage.setItem('sampleAmanah', JSON.stringify(sampleAmanah));
        localStorage.setItem('defaultDataSetup', 'true');
    }
}

// التحقق من حالة المصادقة
function checkAuthState() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        AppState.currentUser = JSON.parse(savedUser);
        loadUserData();
        showDashboard();
    } else {
        showWelcome();
    }
}

// إعداد مستمعي الأحداث
function setupEventListeners() {
    // نموذج تسجيل الدخول
    document.getElementById('loginForm')?.addEventListener('submit', function(e) {
        e.preventDefault();
        login();
    });

    // نموذج إنشاء حساب
    document.getElementById('registerForm')?.addEventListener('submit', function(e) {
        e.preventDefault();
        register();
    });

    // نموذج إضافة سيارة
    document.getElementById('addCarForm')?.addEventListener('submit', function(e) {
        e.preventDefault();
        addCar();
    });

    // نموذج إضافة مصروف
    document.getElementById('addExpenseForm')?.addEventListener('submit', function(e) {
        e.preventDefault();
        addExpense();
    });

    // نموذج إضافة حركة عهدة
    document.getElementById('addAmanahForm')?.addEventListener('submit', function(e) {
        e.preventDefault();
        addAmanah();
    });
}

// إظهار شاشة الترحيب
function showWelcome() {
    hideAllScreens();
    document.getElementById('welcomeScreen').style.display = 'flex';
}

// إظهار شاشة تسجيل الدخول
function showLogin() {
    hideAllScreens();
    document.getElementById('loginScreen').style.display = 'flex';
}

// إظهار شاشة إنشاء حساب
function showRegister() {
    hideAllScreens();
    document.getElementById('registerScreen').style.display = 'flex';
}

// إخفاء جميع الشاشات
function hideAllScreens() {
    const screens = ['welcomeScreen', 'loginScreen', 'registerScreen', 'dashboard'];
    screens.forEach(screen => {
        document.getElementById(screen).style.display = 'none';
    });
}

// تسجيل الدخول
function login() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const user = users.find(u => u.email === email && u.password === password);

    if (user) {
        AppState.currentUser = user;
        localStorage.setItem('currentUser', JSON.stringify(user));
        loadUserData();
        showDashboard();
        showNotification('تم تسجيل الدخول بنجاح', 'success');
    } else {
        showNotification('البريد الإلكتروني أو كلمة المرور غير صحيحة', 'error');
    }
}

// إنشاء حساب جديد
function register() {
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const phone = document.getElementById('registerPhone').value;

    const users = JSON.parse(localStorage.getItem('users') || '[]');
    
    if (users.find(u => u.email === email)) {
        showNotification('هذا البريد الإلكتروني مسجل بالفعل', 'error');
        return;
    }

    const newUser = {
        id: Date.now().toString(),
        name,
        email,
        password,
        phone,
        createdAt: new Date().toISOString()
    };

    users.push(newUser);
    localStorage.setItem('users', JSON.stringify(users));
    
    AppState.currentUser = newUser;
    localStorage.setItem('currentUser', JSON.stringify(newUser));
    
    // تحميل البيانات التجريبية للمستخدم الجديد
    loadSampleData();
    
    showDashboard();
    showNotification('تم إنشاء الحساب بنجاح', 'success');
}

// تحميل البيانات التجريبية
function loadSampleData() {
    const sampleCars = JSON.parse(localStorage.getItem('sampleCars') || '[]');
    const sampleExpenses = JSON.parse(localStorage.getItem('sampleExpenses') || '[]');
    const sampleAmanah = JSON.parse(localStorage.getItem('sampleAmanah') || '[]');

    AppState.cars = sampleCars;
    AppState.expenses = sampleExpenses;
    AppState.amanah = sampleAmanah;
    
    saveUserData();
}

// إظهار لوحة التحكم
function showDashboard() {
    hideAllScreens();
    document.getElementById('dashboard').style.display = 'block';
    document.getElementById('userName').textContent = AppState.currentUser.name;
    updateDashboard();
}

// تسجيل الخروج
function logout() {
    AppState.currentUser = null;
    localStorage.removeItem('currentUser');
    showWelcome();
    showNotification('تم تسجيل الخروج بنجاح', 'success');
}

// تحميل بيانات المستخدم
function loadUserData() {
    if (!AppState.currentUser) return;
    
    const userData = JSON.parse(localStorage.getItem(`userData_${AppState.currentUser.id}`) || '{}');
    AppState.cars = userData.cars || [];
    AppState.expenses = userData.expenses || [];
    AppState.amanah = userData.amanah || [];
}

// حفظ بيانات المستخدم
function saveUserData() {
    if (!AppState.currentUser) return;
    
    const userData = {
        cars: AppState.cars,
        expenses: AppState.expenses,
        amanah: AppState.amanah
    };
    
    localStorage.setItem(`userData_${AppState.currentUser.id}`, JSON.stringify(userData));
}

// تبديل الشريط الجانبي
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('active');
}

// إظهار قسم معين
function showSection(sectionName) {
    // إخفاء جميع الأقسام
    document.querySelectorAll('.section').forEach(section => {
        section.style.display = 'none';
    });
    
    // إزالة النشاط من جميع عناصر القائمة
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // إظهار القسم المطلوب
    document.getElementById(`${sectionName}Section`).style.display = 'block';
    
    // تعيين النشاط لعنصر القائمة
    const navItem = document.querySelector(`.nav-item[onclick="showSection('${sectionName}')"]`);
    if (navItem) {
        navItem.classList.add('active');
    }
    
    AppState.currentSection = sectionName;
    
    // تحديث البيانات الخاصة بالقسم
    if (sectionName === 'expenses') {
        updateExpensesSection();
    } else if (sectionName === 'amanah') {
        updateAmanahSection();
    } else if (sectionName === 'reports') {
        updateReportsSection();
    }
}

// تحديث لوحة التحكم
function updateDashboard() {
    updateStats();
    updateRecentActivities();
    updateCarsGrid();
}

// تحديث الإحصائيات
function updateStats() {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    const expiringSoon = AppState.cars.filter(car => {
        const expiryDate = new Date(car.licenseExpiry);
        return expiryDate > now && expiryDate <= thirtyDaysFromNow;
    }).length;
    
    const totalExpenses = AppState.expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const amanahBalance = calculateAmanahBalance();

    document.getElementById('totalCars').textContent = AppState.cars.length;
    document.getElementById('expiringSoon').textContent = expiringSoon;
    document.getElementById('totalExpenses').textContent = totalExpenses.toLocaleString();
    document.getElementById('amanahBalance').textContent = amanahBalance.toLocaleString();
}

// تحديث الأنشطة الحديثة
function updateRecentActivities() {
    const recentExpenses = AppState.expenses.slice(-5).reverse();
    const recentAmanah = AppState.amanah.slice(-5).reverse();
    
    updateRecentExpenses(recentExpenses);
    updateRecentAmanah(recentAmanah);
}

// تحديث المصاريف الحديثة
function updateRecentExpenses(expenses) {
    const recentExpensesElement = document.getElementById('recentExpenses');
    
    if (expenses.length === 0) {
        recentExpensesElement.innerHTML = '<p class="no-data">لا توجد مصاريف حديثة</p>';
        return;
    }
    
    recentExpensesElement.innerHTML = expenses.map(expense => {
        const car = AppState.cars.find(c => c.id === expense.carId);
        return `
            <div class="activity-item">
                <div class="activity-info">
                    <strong>${car?.plateNumber || 'غير معروف'}</strong>
                    <div>${expense.type} - ${formatDate(expense.date)}</div>
                </div>
                <div class="activity-amount amount-negative">
                    -${expense.amount.toLocaleString()} ريال
                </div>
            </div>
        `;
    }).join('');
}

// تحديث حركات العهدة الحديثة
function updateRecentAmanah(amanah) {
    const recentAmanahElement = document.getElementById('recentAmanah');
    
    if (amanah.length === 0) {
        recentAmanahElement.innerHTML = '<p class="no-data">لا توجد حركات حديثة</p>';
        return;
    }
    
    recentAmanahElement.innerHTML = amanah.map(item => {
        const amountClass = item.type === 'credit' ? 'amount-positive' : 'amount-negative';
        const sign = item.type === 'credit' ? '+' : '-';
        
        return `
            <div class="activity-item">
                <div class="activity-info">
                    <strong>${item.description}</strong>
                    <div>${formatDate(item.date)}</div>
                </div>
                <div class="activity-amount ${amountClass}">
                    ${sign}${item.amount.toLocaleString()} ريال
                </div>
            </div>
        `;
    }).join('');
}

// تحديث قسم المصاريف
function updateExpensesSection() {
    updateExpensesFilters();
    updateExpensesSummary();
    updateExpensesTable();
}

// تحديث فلاتر المصاريف
function updateExpensesFilters() {
    const carFilter = document.getElementById('expenseCarFilter');
    carFilter.innerHTML = '<option value="">جميع السيارات</option>';
    
    AppState.cars.forEach(car => {
        carFilter.innerHTML += `<option value="${car.id}">${car.plateNumber}</option>`;
    });
}

// تحديث ملخص المصاريف
function updateExpensesSummary() {
    const totalExpenses = AppState.expenses.reduce((sum, expense) => sum + expense.amount, 0);
    
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthlyExpenses = AppState.expenses
        .filter(expense => {
            const expenseDate = new Date(expense.date);
            return expenseDate.getMonth() === currentMonth && expenseDate.getFullYear() === currentYear;
        })
        .reduce((sum, expense) => sum + expense.amount, 0);
    
    const averageExpenses = AppState.expenses.length > 0 ? totalExpenses / AppState.expenses.length : 0;

    document.getElementById('totalExpensesAmount').textContent = totalExpenses.toLocaleString() + ' ريال';
    document.getElementById('monthlyExpenses').textContent = monthlyExpenses.toLocaleString() + ' ريال';
    document.getElementById('averageExpenses').textContent = averageExpenses.toLocaleString() + ' ريال';
}

// تحديث جدول المصاريف
function updateExpensesTable() {
    const expensesTable = document.getElementById('expensesTable');
    const filteredExpenses = filterExpensesData();
    
    if (filteredExpenses.length === 0) {
        expensesTable.innerHTML = '<tr><td colspan="6" class="no-data">لا توجد مصاريف</td></tr>';
        return;
    }
    
    expensesTable.innerHTML = filteredExpenses.map(expense => {
        const car = AppState.cars.find(c => c.id === expense.carId);
        return `
            <tr>
                <td>${formatDate(expense.date)}</td>
                <td>${car?.plateNumber || 'غير معروف'}</td>
                <td>${expense.type}</td>
                <td>${expense.amount.toLocaleString()} ريال</td>
                <td>${expense.description}</td>
                <td>
                    <button class="btn btn-danger btn-sm" onclick="deleteExpense('${expense.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// تصفية بيانات المصاريف
function filterExpensesData() {
    const carFilter = document.getElementById('expenseCarFilter').value;
    const monthFilter = document.getElementById('expenseMonthFilter').value;
    const yearFilter = document.getElementById('expenseYearFilter').value;
    
    return AppState.expenses.filter(expense => {
        const expenseDate = new Date(expense.date);
        const matchesCar = !carFilter || expense.carId === carFilter;
        const matchesMonth = !monthFilter || (expenseDate.getMonth() + 1) === parseInt(monthFilter);
        const matchesYear = !yearFilter || expenseDate.getFullYear() === parseInt(yearFilter);
        
        return matchesCar && matchesMonth && matchesYear;
    });
}

// تحديث قسم العهدة
function updateAmanahSection() {
    updateAmanahSummary();
    updateAmanahTable();
}

// تحديث ملخص العهدة
function updateAmanahSummary() {
    const totalCredit = AppState.amanah
        .filter(item => item.type === 'credit')
        .reduce((sum, item) => sum + item.amount, 0);
    
    const totalDebit = AppState.amanah
        .filter(item => item.type === 'debit')
        .reduce((sum, item) => sum + item.amount, 0);
    
    const currentBalance = calculateAmanahBalance();

    document.getElementById('currentBalance').textContent = currentBalance.toLocaleString() + ' ريال';
    document.getElementById('totalCredit').textContent = totalCredit.toLocaleString() + ' ريال';
    document.getElementById('totalDebit').textContent = totalDebit.toLocaleString() + ' ريال';
}

// حساب رصيد العهدة
function calculateAmanahBalance() {
    return AppState.amanah.reduce((balance, item) => {
        return item.type === 'credit' ? balance + item.amount : balance - item.amount;
    }, 0);
}

// تحديث جدول العهدة
function updateAmanahTable() {
    const amanahTable = document.getElementById('amanahTable');
    const filteredAmanah = filterAmanahData();
    
    if (filteredAmanah.length === 0) {
        amanahTable.innerHTML = '<tr><td colspan="6" class="no-data">لا توجد حركات</td></tr>';
        return;
    }
    
    amanahTable.innerHTML = filteredAmanah.map(item => {
        const typeText = item.type === 'credit' ? 'دائن' : 'مدين';
        const typeClass = item.type === 'credit' ? 'amount-positive' : 'amount-negative';
        
        return `
            <tr>
                <td>${formatDate(item.date)}</td>
                <td><span class="${typeClass}">${typeText}</span></td>
                <td>${item.amount.toLocaleString()} ريال</td>
                <td>${item.description}</td>
                <td>${item.balance.toLocaleString()} ريال</td>
                <td>
                    <button class="btn btn-danger btn-sm" onclick="deleteAmanah('${item.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// تصفية بيانات العهدة
function filterAmanahData() {
    const typeFilter = document.getElementById('amanahTypeFilter').value;
    const monthFilter = document.getElementById('amanahMonthFilter').value;
    
    return AppState.amanah.filter(item => {
        const itemDate = new Date(item.date);
        const matchesType = !typeFilter || item.type === typeFilter;
        const matchesMonth = !monthFilter || 
            `${itemDate.getFullYear()}-${String(itemDate.getMonth() + 1).padStart(2, '0')}` === monthFilter;
        
        return matchesType && matchesMonth;
    });
}

// تحديث قسم التقارير
function updateReportsSection() {
    updateCharts();
    updateDetailedReport();
}

// تحديث الرسوم البيانية
function updateCharts() {
    // هنا يمكن إضافة مكتبات الرسوم البيانية مثل Chart.js
    document.getElementById('monthlyExpensesChart').innerHTML = 'رسم بياني للمصاريف الشهرية';
    document.getElementById('expensesDistributionChart').innerHTML = 'رسم بياني لتوزيع المصاريف';
    document.getElementById('amanahFlowChart').innerHTML = 'رسم بياني لحركة العهدة';
}

// تحديث التقرير المفصل
function updateDetailedReport() {
    const reportTable = document.getElementById('detailedReportTable');
    // تنفيذ التقرير المفصل
    reportTable.innerHTML = '<p>سيتم عرض التقرير المفصل هنا</p>';
}

// إظهار مودال إضافة سيارة
function showAddCarModal() {
    document.getElementById('addCarModal').classList.add('active');
    document.getElementById('addCarForm').reset();
}

// إغلاق مودال إضافة سيارة
function closeAddCarModal() {
    document.getElementById('addCarModal').classList.remove('active');
}

// إضافة سيارة جديدة
function addCar() {
    const plate = document.getElementById('carPlate').value;
    const model = document.getElementById('carModel').value;
    const year = document.getElementById('carYear').value;
    const expiry = document.getElementById('licenseExpiry').value;
    const cost = document.getElementById('licenseCost').value;

    const newCar = {
        id: Date.now().toString(),
        plateNumber: plate,
        model: model,
        year: year,
        licenseExpiry: expiry,
        cost: cost,
        createdAt: new Date().toISOString()
    };

    AppState.cars.push(newCar);
    saveUserData();
    updateDashboard();
    closeAddCarModal();
    showNotification('تم إضافة السيارة بنجاح', 'success');
}

// إظهار مودال إضافة مصروف
function showAddExpenseModal() {
    const carSelect = document.getElementById('expenseCar');
    carSelect.innerHTML = '<option value="">اختر السيارة</option>';
    
    AppState.cars.forEach(car => {
        carSelect.innerHTML += `<option value="${car.id}">${car.plateNumber}</option>`;
    });
    
    document.getElementById('addExpenseModal').classList.add('active');
    document.getElementById('addExpenseForm').reset();
    document.getElementById('expenseDate').value = new Date().toISOString().split('T')[0];
}

// إغلاق مودال إضافة مصروف
function closeAddExpenseModal() {
    document.getElementById('addExpenseModal').classList.remove('active');
}

// إضافة مصروف جديد
function addExpense() {
    const carId = document.getElementById('expenseCar').value;
    const type = document.getElementById('expenseType').value;
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const date = document.getElementById('expenseDate').value;
    const description = document.getElementById('expenseDescription').value;

    const newExpense = {
        id: Date.now().toString(),
        carId: carId,
        type: type,
        amount: amount,
        date: date,
        description: description,
        createdAt: new Date().toISOString()
    };

    AppState.expenses.push(newExpense);
    saveUserData();
    
    if (AppState.currentSection === 'expenses') {
        updateExpensesSection();
    }
    updateDashboard();
    closeAddExpenseModal();
    showNotification('تم إضافة المصروف بنجاح', 'success');
}

// إظهار مودال إضافة حركة عهدة
function showAddAmanahModal(type) {
    const modalTitle = document.getElementById('amanahModalTitle');
    modalTitle.textContent = type === 'credit' ? 'إضافة دائن (إيداع)' : 'إضافة مدين (سحب)';
    
    document.getElementById('amanahType').value = type;
    document.getElementById('addAmanahModal').classList.add('active');
    document.getElementById('addAmanahForm').reset();
    document.getElementById('amanahDate').value = new Date().toISOString().split('T')[0];
}

// إغلاق مودال إضافة حركة عهدة
function closeAddAmanahModal() {
    document.getElementById('addAmanahModal').classList.remove('active');
}

// إضافة حركة عهدة جديدة
function addAmanah() {
    const type = document.getElementById('amanahType').value;
    const amount = parseFloat(document.getElementById('amanahAmount').value);
    const date = document.getElementById('amanahDate').value;
    const description = document.getElementById('amanahDescription').value;

    const currentBalance = calculateAmanahBalance();
    const newBalance = type === 'credit' ? currentBalance + amount : currentBalance - amount;

    const newAmanah = {
        id: Date.now().toString(),
        type: type,
        amount: amount,
        date: date,
        description: description,
        balance: newBalance,
        createdAt: new Date().toISOString()
    };

    AppState.amanah.push(newAmanah);
    saveUserData();
    
    if (AppState.currentSection === 'amanah') {
        updateAmanahSection();
    }
    updateDashboard();
    closeAddAmanahModal();
    showNotification('تم إضافة الحركة بنجاح', 'success');
}

// دوال المساعدة
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('ar-SA');
}

function showNotification(message, type) {
    // تنفيذ بسيط للإشعارات
    alert(message);
}

// تصفية البيانات
function filterExpenses() {
    updateExpensesTable();
}

function filterAmanah() {
    updateAmanahTable();
}

// حذف البيانات
function deleteExpense(expenseId) {
    if (confirm('هل أنت متأكد من حذف هذا المصروف؟')) {
        AppState.expenses = AppState.expenses.filter(expense => expense.id !== expenseId);
        saveUserData();
        updateExpensesSection();
        updateDashboard();
        showNotification('تم حذف المصروف بنجاح', 'success');
    }
}

function deleteAmanah(amanahId) {
    if (confirm('هل أنت متأكد من حذف هذه الحركة؟')) {
        AppState.amanah = AppState.amanah.filter(item => item.id !== amanahId);
        saveUserData();
        updateAmanahSection();
        updateDashboard();
        showNotification('تم حذف الحركة بنجاح', 'success');
    }
}

// تحديث شبكة السيارات (الوظيفة الحالية)
function updateCarsGrid() {
    const carsGrid = document.getElementById('carsGrid');
    
    if (AppState.cars.length === 0) {
        carsGrid.innerHTML = `
            <div class="no-cars">
                <i class="fas fa-car" style="font-size: 3rem; color: #ccc; margin-bottom: 20px;"></i>
                <p>لا توجد سيارات مسجلة</p>
                <button class="btn btn-primary" onclick="showAddCarModal()">إضافة أول سيارة</button>
            </div>
        `;
        return;
    }
    
    carsGrid.innerHTML = AppState.cars.map(car => {
        const status = getLicenseStatus(car.licenseExpiry);
        const statusText = getLicenseStatusText(car.licenseExpiry);
        const daysRemaining = getDaysRemaining(car.licenseExpiry);
        
        return `
            <div class="car-card ${status === 'status-warning' ? 'expiring' : status === 'status-danger' ? 'expired' : ''}">
                <div class="car-header">
                    <span class="car-plate">${car.plateNumber}</span>
                    <span class="car-status ${status}">${statusText}</span>
                </div>
                <div class="car-info">
                    <div class="car-info-item">
                        <span>الموديل:</span>
                        <span>${car.model} - ${car.year}</span>
                    </div>
                    <div class="car-info-item">
                        <span>انتهاء الرخصة:</span>
                        <span>${formatDate(car.licenseExpiry)}</span>
                    </div>
                    <div class="car-info-item">
                        <span>الأيام المتبقية:</span>
                        <span>${daysRemaining}</span>
                    </div>
                    <div class="car-info-item">
                        <span>التكلفة:</span>
                        <span>${car.cost} ريال</span>
                    </div>
                </div>
                <div class="car-actions">
                    <button class="btn btn-secondary" onclick="editCar('${car.id}')">
                        <i class="fas fa-edit"></i>
                        تعديل
                    </button>
                    <button class="btn btn-danger" onclick="deleteCar('${car.id}')">
                        <i class="fas fa-trash"></i>
                        حذف
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// دوال مساعدة إضافية
function getLicenseStatus(expiryDate) {
    const now = new Date();
    const expiry = new Date(expiryDate);
    const daysRemaining = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    
    if (daysRemaining <= 0) return 'status-danger';
    if (daysRemaining <= 30) return 'status-warning';
    return 'status-good';
}

function getLicenseStatusText(expiryDate) {
    const now = new Date();
    const expiry = new Date(expiryDate);
    const daysRemaining = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    
    if (daysRemaining <= 0) return 'منتهية';
    if (daysRemaining <= 30) return `تنتهي خلال ${daysRemaining} يوم`;
    return 'سارية';
}

function getDaysRemaining(expiryDate) {
    const now = new Date();
    const expiry = new Date(expiryDate);
    const daysRemaining = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    
    if (daysRemaining <= 0) return 'منتهية';
    return `${daysRemaining} يوم`;
}

// حذف سيارة
function deleteCar(carId) {
    if (confirm('هل أنت متأكد من حذف هذه السيارة؟')) {
        AppState.cars = AppState.cars.filter(car => car.id !== carId);
        saveUserData();
        updateDashboard();
        showNotification('تم حذف السيارة بنجاح', 'success');
    }
}

// تهيئة التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', init);
