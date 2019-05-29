<?php

namespace App\Mail;

use Illuminate\Support\Facades\Lang;
use Illuminate\Notifications\Messages\MailMessage;

class ResetPassword extends \Illuminate\Auth\Notifications\ResetPassword
{
    /**
     * User email.
     *
     * @var string
     */
    public $email;

    public function __construct($email, $token)
    {
        parent::__construct($token);
        $this->email = $email;
    }

    /**
     * Build the mail representation of the notification.
     *
     * @param  mixed  $notifiable
     * @return \Illuminate\Notifications\Messages\MailMessage
     */
    public function toMail($notifiable)
    {
        if (static::$toMailCallback) {
            return call_user_func(static::$toMailCallback, $notifiable, $this->token);
        }

        return (new MailMessage)
            ->subject(Lang::getFromJson('Reset Password Notification'))
            ->line(Lang::getFromJson('You are receiving this email because we received a password reset request for your account.'))
            ->action(Lang::getFromJson('Reset Password'), url(config('app.url').route('password.reset', [
                'token' => $this->token,
                'email' => $this->email,
            ], false)))
            ->line(Lang::getFromJson('If you did not request a password reset, no further action is required.'));
    }
}