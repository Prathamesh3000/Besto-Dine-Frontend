// Request-a-demo PAGE — route /request-demo. Same form as the staff-login
// modal (Components/Common/RequestDemoForm.jsx), posting to POST /public/lead.
import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, CheckCircle2 } from 'lucide-react';
import RequestDemoForm from '../../Components/Common/RequestDemoForm';
import { PlatformHeader, PlatformFooter } from './components/PlatformChrome';
import { usePageMeta } from './platformShared';

const RequestDemo = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    usePageMeta(
        t('request_demo.meta_title', 'Request a demo — BestoDine'),
        t('request_demo.meta_description', 'See BestoDine running for your restaurant: QR ordering, kitchen display, waiter app, bookings and payments.'),
    );

    const points = [
        t('request_demo.point1', 'A walkthrough of QR ordering, the kitchen display and the waiter app'),
        t('request_demo.point2', 'Help choosing the right plan for your outlets'),
        t('request_demo.point3', 'Answers on payments, bookings and going live'),
    ];

    return (
        <div className="min-h-screen bg-[#FCFCFD] flex flex-col">
            <PlatformHeader />
            <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-14 grid lg:grid-cols-2 gap-10 items-start">
                <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF3E6] text-[#B54708] px-3 py-1.5 text-[12px] font-bold">
                        <CalendarCheck size={13} /> {t('request_demo.badge', 'Free, no obligation')}
                    </span>
                    <h1 className="mt-4 text-[32px] sm:text-[42px] leading-tight font-extrabold tracking-tight text-[#101828]">
                        {t('request_demo.title', 'See BestoDine running for your restaurant')}
                    </h1>
                    <p className="mt-4 text-[16px] text-[#475467] leading-relaxed max-w-lg">
                        {t('request_demo.subtitle', "Leave your details and our team will call you — usually within 24 hours.")}
                    </p>
                    <ul className="mt-6 space-y-3">
                        {points.map(p => (
                            <li key={p} className="flex items-start gap-2.5 text-[15px] text-[#344054]">
                                <CheckCircle2 size={18} className="text-[#FE8301] shrink-0 mt-0.5" /> {p}
                            </li>
                        ))}
                    </ul>
                    <p className="mt-8 text-[14px] text-[#667085]">
                        {t('request_demo.register_prompt', 'Ready to start now?')}{' '}
                        <Link to="/register-restaurant" className="font-semibold text-[#FE8301] hover:underline">
                            {t('platform.cta.register', 'Register your hotel')}
                        </Link>
                    </p>
                </div>
                <div className="bg-white rounded-3xl border border-[#EAECF0] shadow-[0_12px_40px_rgba(16,24,40,0.08)] overflow-hidden">
                    <div className="px-6 pt-6 pb-4 border-b border-[#F2F4F7]">
                        <h2 className="text-[18px] font-extrabold text-[#101828]">{t('request_demo.form_title', 'Request a demo')}</h2>
                        <p className="text-[13px] text-[#667085] mt-0.5">{t('request_demo.form_subtitle', 'Takes less than a minute.')}</p>
                    </div>
                    <RequestDemoForm
                        source={(searchParams.get('source') || 'request-demo').slice(0, 100)}
                        idPrefix="demo-page"
                        initialValues={{ restaurantName: (searchParams.get('restaurant') || '').slice(0, 100) }}
                        onDone={() => navigate('/')}
                        doneLabel={t('request_demo.done', 'Back to BestoDine')}
                    />
                </div>
            </main>
            <PlatformFooter />
        </div>
    );
};

export default RequestDemo;
